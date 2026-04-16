#include <napi.h>

// Platform-Specific Forward Declarations
void StartPlatformTouchpad(Napi::ThreadSafeFunction tsfn);
void StopPlatformTouchpad();

Napi::ThreadSafeFunction g_tsfn;

Napi::Value StartTouchpad(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsFunction()) {
        Napi::TypeError::New(env, "Function expected").ThrowAsJavaScriptException();
        return env.Null();
    }

    if (g_tsfn) {
        return env.Null();
    }

    g_tsfn = Napi::ThreadSafeFunction::New(
        env,
        info[0].As<Napi::Function>(),
        "TouchpadCallback",
        0,
        1
    );

    StartPlatformTouchpad(g_tsfn);
    return env.Null();
}
Napi::Value StopTouchpad(const Napi::CallbackInfo& info) {
    StopPlatformTouchpad();
    if (g_tsfn) {
        g_tsfn.Release();
        g_tsfn = nullptr;
    }
    return info.Env().Null();
}

#ifdef _WIN32
Napi::Value SetAbsMode(const Napi::CallbackInfo& info);
#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    exports.Set(Napi::String::New(env, "start"), Napi::Function::New(env, StartTouchpad));
    exports.Set(Napi::String::New(env, "stop"), Napi::Function::New(env, StopTouchpad));
#ifdef _WIN32
    exports.Set(Napi::String::New(env, "setAbsMode"), Napi::Function::New(env, SetAbsMode));
#else
    // Dummy on Mac for now
    exports.Set(Napi::String::New(env, "setAbsMode"), Napi::Function::New(env, [](const Napi::CallbackInfo& info) {
        return info.Env().Null();
    }));
#endif
    return exports;
}

NODE_API_MODULE(touchpad, Init)
