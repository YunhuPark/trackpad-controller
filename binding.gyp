{
  "targets": [
    {
      "target_name": "touchpad",
      "sources": [
        "src/native/touchpad.cc"
      ],
      "cflags!": [ "-fno-exceptions" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ],
      "conditions": [
        ["OS=='win'", {
          "sources": [
            "src/native/touchpad_win.cc"
          ],
          "libraries": [
            "-luser32.lib",
            "-lhid.lib",
            "-lsetupapi.lib"
          ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1
            }
          }
        }],
        ["OS=='mac'", {
          "sources": [
            "src/native/touchpad_mac.mm"
          ],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          },
          "link_settings": {
            "libraries": [
              "-framework Cocoa",
              "-framework ApplicationServices",
              "-framework CoreGraphics"
            ]
          }
        }]
      ]
    }
  ]
}
