# KMD Helper

[English](#english) | [中文](#中文)

## English

KMD Helper is a Chrome extension that detects course time blocks on Keio University KMD course pages (`archiver.kmd.keio.ac.jp`) and helps you add them to Google Calendar via the Google Calendar API.

## Installation

1. Download this repository's source (Code → Download ZIP) or clone it locally.
2. Open Chrome and go to `chrome://extensions/`.
3. Enable "Developer mode" (top-right).
4. Click "Load unpacked" and select the `kmdhelpler` directory from the source.
5. If you want to use my API (developer-owned Google project), please send me your installed Extension ID (chrome://extensions → Developer mode → find the ID under KMD Helper).

Note: The extension only runs automatically on the `archiver.kmd.keio.ac.jp` domain.

## Usage

On any course detail page, the extension will:
- Detect time blocks in formats like `YYYY-MM-DD (Weekday) HH:MM - HH:MM` or `YYYY/MM/DD - Title`. When a date is found without an explicit time, the extension can infer the time using cached course slots (see "Slot-based Time Inference").
- Convert them into Google Calendar events with title, time, description, and location
- Inject buttons at the bottom of the page:
  - Add all via Google Calendar API: create all events at once via API (requires Google authorization)
  - Delete all via Google Calendar API: delete events previously created via API for the same course (fingerprint-based matching)

### Google Authorization (API buttons only)
- On the first API action, a consent flow will open. The token is cached locally and will be refreshed by re-authorizing when expired.
- Events are created in your `primary` calendar.

## Field Details
- Title: built from course name + session title
- Time: parsed start/end in your local timezone
- Location: extracted from the page field "開講場所 / Class Room" when available; empty otherwise
- Description: the text block following the time and title

## Slot-based Time Inference

Some courses list only the date (no precise time) for sessions. This extension can fill in the missing time based on cached slot information from the course overview (homepage) and clearly mark inferred entries.

### How it works
1. On the KMD course overview page (homepage), click the injected button `Cache course slots locally` to save the current term's course-name → weekday/slot mapping.
2. On each course detail page, when a session line with a date but no explicit time is detected (e.g., `YYYY/MM/DD - Title`):
   - The extension computes the weekday for that date.
   - If a slot for that weekday exists in the cached data for the same course, it fills in the corresponding time range.
   - The displayed text includes the tag `[inferred]` after the time to indicate it was inferred.

### Slot → Time mapping
- 1 → 09:00–10:30
- 2 → 10:45–12:15
- 3 → 13:00–14:30
- 4 → 14:45–16:15
- 5 → 16:30–18:00

### Display behavior
- Multi-line blocks are rewritten so the first line shows `YYYY-MM-DD HH:MM - HH:MM [inferred]` when time was inferred; titles/descriptions stay below.
- Single-line entries like `YYYY/MM/DD - Title` become `YYYY-MM-DD HH:MM - HH:MM [inferred] - Title`.
- In all cases, the rewritten block remains a clickable link to create a Google Calendar event.

### Notes & limitations
- You must cache slots first on the course overview page for the current term; inference depends on that cache.
- If no matching weekday/slot is found for the course, the entry is skipped (not rewritten) to avoid incorrect times.
- Date parsing supports `YYYY-MM-DD` and `YYYY/MM/DD`. Weekday inside parentheses is optional.
- The computed weekday uses your local timezone. If you work across timezones, verify the day alignment.

## FAQ
- Buttons not visible? Ensure the page domain is `archiver.kmd.keio.ac.jp`, then refresh.
- Creation failed (API)? Likely expired authorization or missing permission; re-authorize when prompted and retry.

## Development
- Main files live in `kmdhelpler/`:
  - `manifest.json`: extension manifest
  - `content.js`: parses the page and injects buttons/links
  - `background.js`: handles Google OAuth and Calendar API calls
  - `styles.css`: button styles

## Privacy & Security
- OAuth access tokens are stored in Chrome local storage and used only for Google Calendar API calls.
- Do not commit any private keys or secrets. `kmdhelpler.pem` is in `.gitignore` and has been removed from history.

## License
This project is licensed under GPL-3.0-or-later. See the `LICENSE` file at the repository root for details.

## 中文

KMD Helper 是一个 Chrome 扩展，用于在 KMD 课程页面（`archiver.kmd.keio.ac.jp`）上识别课程时间块，并通过 Google Calendar API 将其添加到 Google 日历。

### 安装
1. 下载本仓库源码（Code → Download ZIP）或使用 git clone 到本地。
2. 打开 Chrome，访问 `chrome://extensions/`。
3. 在右上角开启「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择源码目录 `kmdhelpler`。
5. 若想使用我的 API（开发者的 Google 项目额度），请把安装好的扩展 ID 发给我（chrome://extensions → 开发者模式 → 在 KMD Helper 卡片下方查看 ID）。

注意：扩展仅在 `archiver.kmd.keio.ac.jp` 域名页面自动运行。

### 使用
在任意课程详情页上，扩展会：
- 识别形如 `YYYY-MM-DD (Weekday) HH:MM - HH:MM` 或 `YYYY/MM/DD - 标题` 的时间块；当只有日期没有明确时间时，会利用已缓存的课程时限（slot）信息进行推断（见「基于时限的时间推断」）。
- 将识别结果转换为包含标题、时间、描述、地点的 Google 日历事件。
- 在页面底部注入按钮：
  - Add all via Google Calendar API：通过 API 一次性创建全部事件（需要 Google 授权）
  - Delete all via Google Calendar API：删除此前通过 API 创建的同一课程的事件（基于指纹匹配）

### Google 授权（仅 API 功能）
- 首次使用 API 功能时会打开同意授权流程。令牌会本地缓存，到期后按需重新授权。
- 事件会创建在你的 `primary` 日历中。

### 字段说明
- 标题：由课程名 + 具体场次标题组成
- 时间：按本地时区解析后的开始/结束时间
- 地点：优先从页面字段「開講場所 / Class Room」提取；缺失则为空
- 描述：紧随时间与标题之后的文本块

### 基于时限的时间推断

部分课程的场次只给出日期而没有精确时间。扩展会基于从课程总览页缓存的「星期/时限（slot）」信息，按需要填充时间，并在展示处添加 `[inferred]` 标签。

工作原理：
1. 在 KMD 课程总览（主页）页面，点击注入的按钮「Cache course slots locally」，缓存本学期课程名 → 星期/时限映射。
2. 在课程详情页，如果检测到仅日期（例如 `YYYY/MM/DD - 标题`）：
   - 扩展根据该日期计算星期。
   - 若缓存中存在该课程在该星期的时限，则填充对应的时间段。
   - 在时间后追加 `[inferred]` 标签以表明该时间为推断值。

时限（slot）→ 时间映射：
- 1 → 09:00–10:30
- 2 → 10:45–12:15
- 3 → 13:00–14:30
- 4 → 14:45–16:15
- 5 → 16:30–18:00

展示行为：
- 多行样式：首行会显示 `YYYY-MM-DD HH:MM - HH:MM [inferred]`（如为推断），后续保留标题/描述。
- 单行样式：如 `YYYY/MM/DD - 标题` 会变为 `YYYY-MM-DD HH:MM - HH:MM [inferred] - 标题`。
- 上述重写后的块仍为可点击链接，可创建 Google 日历事件。

注意与限制：
- 需要先在课程总览页完成 slot 缓存；推断依赖该缓存。
- 如果找不到匹配的星期/时限，为避免错误不会重写该条目。
- 支持 `YYYY-MM-DD` 与 `YYYY/MM/DD` 两种日期格式；括号内星期可选。
- 日期对应星期的计算基于你的本地时区，如跨时区使用，请自行核对。

## 常见问题（FAQ）
- 看不到按钮？请确认页面域名为 `archiver.kmd.keio.ac.jp`，然后刷新页面。
- 创建失败（API）？可能是授权过期或权限不足；根据提示重新授权后重试。

## 开发
- 主要文件位于 `kmdhelpler/`：
  - `manifest.json`：扩展清单
  - `content.js`：解析页面并注入按钮/链接
  - `background.js`：处理 Google OAuth 与 Calendar API 调用
  - `styles.css`：按钮样式

## 隐私与安全
- OAuth 访问令牌保存在 Chrome 本地存储，仅用于调用 Google Calendar API。
- 请勿提交任何私钥或机密。`kmdhelpler.pem` 已在 `.gitignore` 中并从历史中移除。

## 许可证
本项目使用 GPL-3.0-or-later 许可证。详见仓库根目录的 `LICENSE` 文件。
