#include <windows.h>
#include <hidsdi.h>
#include <napi.h>
#include <thread>
#include <atomic>
#include <iostream>
#include <vector>
#include <unordered_map>

// Import SetupAPI and HidD functions
#pragma comment(lib, "hid.lib")
#pragma comment(lib, "setupapi.lib")

#define MI_WP_SIGNATURE 0xFF515700
#define SIGNATURE_MASK 0xFFFFFF00

Napi::ThreadSafeFunction g_tsfn_win;
std::atomic<bool> g_running{false};
std::atomic<bool> g_abs_mode{false};
HHOOK g_mouse_hook = NULL;
std::thread g_hook_thread;
HWND g_hwnd_raw = NULL;

// Touchpad dimensions
long g_min_x = 0;
long g_max_x = 3000;
long g_min_y = 0;
long g_max_y = 2000;

// Track active touches
std::unordered_map<int, bool> active_contacts;

struct TouchEvent {
    std::string type;
    double x;
    double y;
    double pressure;
    int id;
};

void EmitEvent(const TouchEvent& ev) {
    if (!g_tsfn_win) return;
    auto* pEv = new TouchEvent(ev);
    g_tsfn_win.BlockingCall(pEv, [](Napi::Env env, Napi::Function jsCallback, TouchEvent* pEvArg) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("type", pEvArg->type);
        obj.Set("x", pEvArg->x);
        obj.Set("y", pEvArg->y);
        obj.Set("pressure", pEvArg->pressure);
        obj.Set("id", pEvArg->id);
        obj.Set("mode", "precision"); 
        jsCallback.Call({ obj });
        delete pEvArg;
    });
}

// Global Low-Level Mouse Hook to block trackpad cursor movement in Abs Mode
LRESULT CALLBACK LowLevelMouseProc(int nCode, WPARAM wParam, LPARAM lParam) {
    if (nCode == HC_ACTION && g_abs_mode) {
        // Block all mouse movement and clicks if Absolute Mode is ON
        if (wParam == WM_MOUSEMOVE || wParam == WM_LBUTTONDOWN || wParam == WM_LBUTTONUP ||
            wParam == WM_RBUTTONDOWN || wParam == WM_RBUTTONUP || wParam == WM_MOUSEWHEEL) {
            return 1;
        }
    }
    return CallNextHookEx(g_mouse_hook, nCode, wParam, lParam);
}

// Window Procedure for our invisible Raw Input target window
LRESULT CALLBACK RawWndProc(HWND hwnd, UINT uMsg, WPARAM wParam, LPARAM lParam) {
    if (uMsg == WM_INPUT) {
        HRAWINPUT hRawInput = (HRAWINPUT)lParam;
        UINT dataSize;
        if (GetRawInputData(hRawInput, RID_INPUT, NULL, &dataSize, sizeof(RAWINPUTHEADER)) != 0) {
            return DefWindowProc(hwnd, uMsg, wParam, lParam);
        }

        RAWINPUT* pRawInput = (RAWINPUT*)malloc(dataSize);
        if (GetRawInputData(hRawInput, RID_INPUT, pRawInput, &dataSize, sizeof(RAWINPUTHEADER)) != dataSize) {
            free(pRawInput);
            return DefWindowProc(hwnd, uMsg, wParam, lParam);
        }

        // 디바이스별 최초 1회만 타입 로그
        static std::unordered_map<HANDLE, bool> s_logged;
        if (!s_logged[pRawInput->header.hDevice]) {
            s_logged[pRawInput->header.hDevice] = true;
            RID_DEVICE_INFO info = {}; UINT sz = sizeof(info); info.cbSize = sizeof(info);
            GetRawInputDeviceInfo(pRawInput->header.hDevice, RIDI_DEVICEINFO, &info, &sz);
            std::cerr << "[Native] device dwType=" << pRawInput->header.dwType
                      << " usagePage=0x" << std::hex << info.hid.usUsagePage
                      << " usage=0x" << info.hid.usUsage << std::dec << std::endl;
        }

        if (pRawInput->header.dwType == RIM_TYPEHID) {
            UINT preSize = 0;
            if (GetRawInputDeviceInfo(pRawInput->header.hDevice, RIDI_PREPARSEDDATA, NULL, &preSize) == 0 && preSize > 0) {
                PHIDP_PREPARSED_DATA pPreparsed = (PHIDP_PREPARSED_DATA)malloc(preSize);
                if (GetRawInputDeviceInfo(pRawInput->header.hDevice, RIDI_PREPARSEDDATA, pPreparsed, &preSize) == preSize) {

                    HIDP_CAPS caps;
                    if (HidP_GetCaps(pPreparsed, &caps) == HIDP_STATUS_SUCCESS) {

                        // Discover Logical Bounds (UsagePage filter removed: accept any page with X/Y usage)
                        if (g_max_x == 3000) {
                            USHORT valCapsLen = caps.NumberInputValueCaps;
                            PHIDP_VALUE_CAPS pValCaps = (PHIDP_VALUE_CAPS)malloc(valCapsLen * sizeof(HIDP_VALUE_CAPS));
                            if (HidP_GetValueCaps(HidP_Input, pValCaps, &valCapsLen, pPreparsed) == HIDP_STATUS_SUCCESS) {
                                for (USHORT i = 0; i < valCapsLen; ++i) {
                                    // Accept Usage 0x30 (X) from any UsagePage
                                    if (pValCaps[i].NotRange.Usage == 0x30 && pValCaps[i].LogicalMax > pValCaps[i].LogicalMin) {
                                        g_min_x = pValCaps[i].LogicalMin;
                                        g_max_x = pValCaps[i].LogicalMax;
                                    }
                                    // Accept Usage 0x31 (Y) from any UsagePage
                                    if (pValCaps[i].NotRange.Usage == 0x31 && pValCaps[i].LogicalMax > pValCaps[i].LogicalMin) {
                                        g_min_y = pValCaps[i].LogicalMin;
                                        g_max_y = pValCaps[i].LogicalMax;
                                    }
                                }
                            }
                            free(pValCaps);
                        }

                        long spanX = (g_max_x - g_min_x) > 0 ? (g_max_x - g_min_x) : 1;
                        long spanY = (g_max_y - g_min_y) > 0 ? (g_max_y - g_min_y) : 1;
                        PCHAR rawData = (PCHAR)pRawInput->data.hid.bRawData;
                        UINT  rawSize = pRawInput->data.hid.dwSizeHid;

                        // Precision Touchpad HID: parse single touch using default collection (0)
                        ULONG xRaw = 0, yRaw = 0, contact = 1;
                        NTSTATUS sx = HidP_GetUsageValue(HidP_Input, 0x01, 0, 0x30, &xRaw, pPreparsed, rawData, rawSize);
                        
                        if (sx == HIDP_STATUS_SUCCESS) {
                            HidP_GetUsageValue(HidP_Input, 0x01, 0, 0x31, &yRaw, pPreparsed, rawData, rawSize);
                            HidP_GetUsageValue(HidP_Input, 0x0D, 0, 0x51, &contact, pPreparsed, rawData, rawSize);
                            if (contact == 0) contact = 1;

                            // Tip Switch (0x42)
                            USAGE tipList[10] = {0};
                            ULONG tipCount = 10;
                            bool isDown = false;
                            if (HidP_GetUsages(HidP_Input, 0x0D, 0, tipList, &tipCount, pPreparsed, rawData, rawSize) == HIDP_STATUS_SUCCESS) {
                                for (ULONG u = 0; u < tipCount; u++) {
                                    if (tipList[u] == 0x42) { isDown = true; break; }
                                }
                            }
                            if (!isDown) {
                                ULONG tipVal = 0;
                                if (HidP_GetUsageValue(HidP_Input, 0x0D, 0, 0x42, &tipVal, pPreparsed, rawData, rawSize) == HIDP_STATUS_SUCCESS && tipVal != 0)
                                    isDown = true;
                            }

                            double normX = (double)((long)xRaw - g_min_x) / spanX;
                            double normY = (double)((long)yRaw - g_min_y) / spanY;
                            if (normX < 0.0) normX = 0.0; if (normX > 1.0) normX = 1.0;
                            if (normY < 0.0) normY = 0.0; if (normY > 1.0) normY = 1.0;

                            bool wasDown = active_contacts[(int)contact];
                            if (isDown && !wasDown) {
                                active_contacts[(int)contact] = true;
                                EmitEvent({"down", normX, normY, 1.0, (int)contact});
                            } else if (isDown && wasDown) {
                                EmitEvent({"move", normX, normY, 1.0, (int)contact});
                            } else if (!isDown && wasDown) {
                                active_contacts[(int)contact] = false;
                                EmitEvent({"up", normX, normY, 0.0, (int)contact});
                            }
                        } else {
                            // sx != HIDP_STATUS_SUCCESS => No X value => Unpack failed => Fingers lifted!
                            for (int c = 1; c <= 10; c++) {
                                if (active_contacts[c]) {
                                    active_contacts[c] = false;
                                    EmitEvent({"up", 0.0, 0.0, 0.0, c});
                                }
                            }
                        }
                    }
                }
                free(pPreparsed);
            }
        }
        free(pRawInput);
    }
    return DefWindowProc(hwnd, uMsg, wParam, lParam);
}

void MessageLoop() {
    // 1. Hook LowLevel Mouse
    g_mouse_hook = SetWindowsHookEx(WH_MOUSE_LL, LowLevelMouseProc, GetModuleHandle(NULL), 0);

    // 2. Setup Invisible Window for Raw Input
    WNDCLASSA wc = {0};
    wc.lpfnWndProc = RawWndProc;
    wc.hInstance = GetModuleHandle(NULL);
    wc.lpszClassName = "TouchpadRawTargetWindow";
    RegisterClassA(&wc);

    g_hwnd_raw = CreateWindowA("TouchpadRawTargetWindow", "RawPad", 0, 0, 0, 0, 0, HWND_MESSAGE, NULL, wc.hInstance, NULL);
    std::cerr << "[Native] HWND created: " << g_hwnd_raw << std::endl;

    // 2b. Enumerate all HID raw input devices for diagnostics
    UINT nDevices = 0;
    GetRawInputDeviceList(NULL, &nDevices, sizeof(RAWINPUTDEVICELIST));
    std::cerr << "[Native] Raw input devices found: " << nDevices << std::endl;
    if (nDevices > 0) {
        std::vector<RAWINPUTDEVICELIST> devList(nDevices);
        GetRawInputDeviceList(devList.data(), &nDevices, sizeof(RAWINPUTDEVICELIST));
        for (UINT i = 0; i < nDevices; i++) {
            RID_DEVICE_INFO info = {};
            UINT sz = sizeof(info);
            info.cbSize = sizeof(info);
            GetRawInputDeviceInfo(devList[i].hDevice, RIDI_DEVICEINFO, &info, &sz);
            if (info.dwType == RIM_TYPEHID) {
                std::cerr << "[Native] HID[" << i << "] UsagePage=0x" << std::hex << info.hid.usUsagePage
                          << " Usage=0x" << info.hid.usUsage << std::dec << std::endl;
            }
        }
    }

    // 3. Register Raw Input — try Touchpad (0x0D/0x05) AND PAGEONLY fallback
    RAWINPUTDEVICE rid[2];
    rid[0].usUsagePage = 0x0D; // Digitizers
    rid[0].usUsage = 0x05;     // Touch Pad
    rid[0].dwFlags = RIDEV_INPUTSINK;
    rid[0].hwndTarget = g_hwnd_raw;
    rid[1].usUsagePage = 0x0D; // Digitizers — catch any digitizer (touch screen, stylus, etc.)
    rid[1].usUsage = 0x04;     // Touch Screen (some touchpads report as this)
    rid[1].dwFlags = RIDEV_INPUTSINK;
    rid[1].hwndTarget = g_hwnd_raw;

    if (!RegisterRawInputDevices(rid, 2, sizeof(rid[0]))) {
        DWORD err = GetLastError();
        std::cerr << "[Native] RegisterRawInputDevices FAILED, err=" << err << std::endl;
        // Fallback: try single registration with PAGEONLY
        RAWINPUTDEVICE ridFallback[1];
        ridFallback[0].usUsagePage = 0x0D;
        ridFallback[0].usUsage = 0x00;
        ridFallback[0].dwFlags = RIDEV_INPUTSINK | RIDEV_PAGEONLY;
        ridFallback[0].hwndTarget = g_hwnd_raw;
        if (!RegisterRawInputDevices(ridFallback, 1, sizeof(ridFallback[0]))) {
            std::cerr << "[Native] PAGEONLY fallback also FAILED, err=" << GetLastError() << std::endl;
        } else {
            std::cerr << "[Native] PAGEONLY fallback registration OK" << std::endl;
        }
    } else {
        std::cerr << "[Native] RegisterRawInputDevices OK (0x0D/0x05 + 0x0D/0x04)" << std::endl;
    }

    MSG msg;
    while (g_running && GetMessage(&msg, NULL, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    if (g_hwnd_raw) {
        DestroyWindow(g_hwnd_raw);
        g_hwnd_raw = NULL;
    }
    if (g_mouse_hook) {
        UnhookWindowsHookEx(g_mouse_hook);
        g_mouse_hook = NULL;
    }
}

void StartPlatformTouchpad(Napi::ThreadSafeFunction tsfn) {
    if (g_running) return;
    g_tsfn_win = tsfn;
    g_running = true;
    g_hook_thread = std::thread(MessageLoop);
}

void StopPlatformTouchpad() {
    if (!g_running) return;
    g_running = false;
    if (g_hook_thread.joinable()) {
        PostThreadMessage(GetThreadId(g_hook_thread.native_handle()), WM_QUIT, 0, 0);
        g_hook_thread.join();
    }
}

Napi::Value SetAbsMode(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() >= 1 && info[0].IsBoolean()) {
        g_abs_mode = info[0].As<Napi::Boolean>().Value();
    }
    return env.Null();
}
