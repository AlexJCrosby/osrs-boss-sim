#Requires AutoHotkey v2.0

framesPerTick := 36
keyDelayMs := 12          ; increase to 15–20 if YouTube misses steps
tick := 0
logFile := A_ScriptDir "\tick_log.txt"

ShowTick() {
    global tick
    ToolTip("Tick: " tick, 20, 20)
    SetTimer(() => ToolTip(), -500)  ; hide after 0.5s
}

Log(msg) {
    global logFile
    FileAppend(FormatTime(A_Now, "HH:mm:ss") " " msg "`n", logFile, "UTF-8")
}

StepFrames(key, count) {
    global keyDelayMs
    Loop count {
        Send key
        Sleep keyDelayMs
    }
}

; F8 = +1 tick
F8:: {
    global framesPerTick, tick
    StepFrames(".", framesPerTick)
    tick += 1
    ShowTick()
    ; Log("Tick " tick " (+)")
}

; F7 = -1 tick (never below 0)
F7:: {
    global framesPerTick, tick
    StepFrames(",", framesPerTick)
    tick := Max(0, tick - 1)
    ShowTick()
    ; Log("Tick " tick " (-)")
}

; F6 = reset tick counter
F6:: {
    global tick
    tick := 0
    ShowTick()
    ; Log("Reset to 0")
}
