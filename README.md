# dsh-fount-reality

參考 [理華角色包](https://github.com/win10ogod/Rika) 的私有 Reality Channel，為 DeepSeek Harness 提供背景螢幕觀察與自主喚醒。針對 DSH `0.1.7-rc.2`、`0.2.0-rc.2` 與 `0.2.1-alpha.1` 開發。

插件持續取樣畫面，但**取樣計時器不直接啟動 Agent loop**。它先以低 FPS 巡看；偵測到明顯變化後，短暫提高 FPS，確認新畫面連續穩定才喚醒獨立的背景 Agent。影片等持續動態畫面會在取樣上限後退回低 FPS，並進入明示的冷卻時間。背景 Agent 才會分析完整畫面、檢視其預設中可用的工具與記憶，只有決定有具體價值時才呼叫 `reality_notify` 發出桌面通知。日常內部分析留在獨立的持久會話，不插入原本的聊天回合。

螢幕擷取使用不同於 Fount `node-screenshots` 的路徑。Windows／macOS 共用 [`@screen-capture/node`](https://github.com/tux-tn/node-screen-capture) 的介面；Linux 後端也交付相同的 PNG 取樣資料給喚醒演算法：

| 桌面 | 擷取方式 | 重啟後狀態 |
| --- | --- | --- |
| Windows 10 1903+ | `@screen-capture/node` 的 Windows Graphics Capture | 有桌面工作階段時自動重連 |
| macOS 12.3+ | 同一套 API，底層 ScreenCaptureKit | 已授予 Screen Recording 權限時自動重連 |
| Linux Wayland | `wayland-screenshot` 常駐 CLI，底層 XDG ScreenCast Portal／PipeWire | 初次執行一次 `cast enroll --monitor`；支援 restore token 的 Portal 可在重啟後無視窗恢復，授權失效時顯示 `permission-required` |
| Linux X11 | `gnome-screenshot` 背景截圖，接到同一取樣介面 | 可讀取 `DISPLAY` 且已安裝命令時自動重試 |

Wayland 需先安裝 [`wayland-screenshot`](https://github.com/dtg01100/wayland-screenshot) 與其 PipeWire／Portal 系統依賴，再以與 DSH 相同的 `DSH_HOME` 執行一次授權：

```bash
WAYLAND_SCREENSHOT_STATE_DIR="${DSH_HOME:-$HOME/.dsh}/storages/fount-reality/wayland" wayland-screenshot cast enroll --monitor
```

插件將 restore token 存在此本機目錄，重啟時交還 Portal 以嘗試免選擇器恢復；是否接受由桌面 Portal 決定。其餘平台仍需登入的桌面工作階段與系統授權。插件只擷取主螢幕。預設只在記憶體保留目前畫面；喚醒時才用 DSH 的附件服務保存該張畫面，並交給背景 Agent。選用的模型必須接受影像輸入，否則 `reality_status` 會顯示錯誤，不改用無影像判斷。

## 安裝與啟用

安裝到所需的 DSH profile，例如 `web`：

```powershell
dsh plugin --profile web add github:win10ogod/dsh-fount-reality
dsh --profile web --dump-config
```

插件預設 `enabled: false`；使用者在 profile 的 `cordis.patch.yml` 啟用，例如：

```yaml
- id: fount-reality
  name: dsh-fount-reality
  config:
    enabled: true
    workspacePath: 'C:\Users\you\project'
    idleFps: 0.2
    burstFps: 2
    noveltyThreshold: 0.06
    stableThreshold: 0.025
    stableSamples: 3
    maxBurstSamples: 24
    minWakeGapMs: 300000
    motionCooldownMs: 60000
```

`workspacePath` 可省略；此時插件在看到有工作區的普通 Agent 會話後開始。`agentPreset` 可指定背景 Agent 使用的預設，省略時沿用所選會話的預設或 DSH 預設。背景 Agent 使用當前 DSH 預設模型，繼承其工具與模型能力；插件沒有替它降低輸出、上下文或工具上限。`idleFps` 與 `burstFps` 只決定擷取頻率，喚醒仍取決於畫面變化與穩定性。`reality_status` 查看運作、最近背景活動與錯誤；`reality_control` 可暫停或恢復本次 DSH 程序中的監看，暫停時也會取消正在執行的背景回合。

`npm run check` 驗證抽樣喚醒與 DSH v4 訊息來源。`npm run smoke:capture` 在目前登入的桌面擷取一張畫面，只輸出尺寸與位元組數，不保存圖片；Wayland 須先完成上述授權，不會由此診斷命令開啟選擇器。診斷命令的影像緩衝上限為 64 MiB，不影響插件使用 DSH 附件服務限額的正式路徑。

驗證範圍：Windows 10/11 原生 API 已擷取 PNG；Linux X11 `gnome-screenshot` 已在原生桌面擷取 PNG；macOS arm64 套件可安裝，但 SSH 工作階段無 Screen Recording 權限，尚未完成原生桌面擷取；Wayland restore-token 流程目前通過模擬測試，尚未在 Wayland 桌面實測。
