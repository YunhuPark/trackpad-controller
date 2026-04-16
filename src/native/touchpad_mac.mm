#include <napi.h>
#import <Cocoa/Cocoa.h>
#include <thread>
#include <atomic>
#include <iostream>

Napi::ThreadSafeFunction g_tsfn_mac;
std::atomic<bool> g_running{false};
CFMachPortRef g_eventTap = NULL;
CFRunLoopSourceRef g_runLoopSource = NULL;
std::thread g_hook_thread;
int g_touch_id = 0;
bool g_touch_active = false;

struct TouchEvent {
    std::string type;
    double x;
    double y;
    double pressure;
    int id;
};

void EmitEvent(const TouchEvent& ev) {
    if (!g_tsfn_mac) return;
    auto* pEv = new TouchEvent(ev);
    g_tsfn_mac.BlockingCall(pEv, [](Napi::Env env, Napi::Function jsCallback, TouchEvent* pEvArg) {
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

CGEventRef EventTapCallback(CGEventTapProxy proxy, CGEventType type, CGEventRef event, void* refcon) {
    if (type == kCGEventLeftMouseDown || type == kCGEventLeftMouseDragged || type == kCGEventLeftMouseUp) {
        
        // Retrieve pressure for force touch trackpad
        double pressure = CGEventGetDoubleValueField(event, kCGMouseEventPressure);
        
        CGPoint pt = CGEventGetLocation(event);
        NSRect screenRect = [[NSScreen mainScreen] frame];
        double x = pt.x / screenRect.size.width;
        // Mac coordinates start from bottom-left for NSScreen, but CGEventLocation is top-left
        double y = pt.y / screenRect.size.height;
        
        if (type == kCGEventLeftMouseDown) {
            g_touch_active = true;
            g_touch_id++;
            EmitEvent({"down", x, y, pressure, g_touch_id});
        } else if (type == kCGEventLeftMouseDragged && g_touch_active) {
            EmitEvent({"move", x, y, pressure, g_touch_id});
        } else if (type == kCGEventLeftMouseUp) {
            g_touch_active = false;
            EmitEvent({"up", x, y, 0.0, g_touch_id});
        }
    }
    return event;
}

void MessageLoop() {
    CGEventMask eventMask = (1 << kCGEventLeftMouseDown) | (1 << kCGEventLeftMouseDragged) | (1 << kCGEventLeftMouseUp);
    g_eventTap = CGEventTapCreate(
        kCGSessionEventTap, kCGHeadInsertEventTap,
        kCGEventTapOptionListenOnly, eventMask, EventTapCallback, NULL
    );
    
    if (!g_eventTap) return;
    
    g_runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, g_eventTap, 0);
    CFRunLoopAddSource(CFRunLoopGetCurrent(), g_runLoopSource, kCFRunLoopCommonModes);
    CGEventTapEnable(g_eventTap, true);
    
    while (g_running) {
        CFRunLoopRunInMode(kCFRunLoopDefaultMode, 0.1, false);
    }
    
    CGEventTapEnable(g_eventTap, false);
    CFRunLoopRemoveSource(CFRunLoopGetCurrent(), g_runLoopSource, kCFRunLoopCommonModes);
    CFRelease(g_runLoopSource);
    CFRelease(g_eventTap);
}

void StartPlatformTouchpad(Napi::ThreadSafeFunction tsfn) {
    if (g_running) return;
    g_tsfn_mac = tsfn;
    g_running = true;
    g_hook_thread = std::thread(MessageLoop);
}

void StopPlatformTouchpad() {
    if (!g_running) return;
    g_running = false;
    if (g_hook_thread.joinable()) {
        g_hook_thread.join();
    }
}
