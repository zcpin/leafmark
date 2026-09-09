# Leafmark Privacy Policy / 叶签隐私政策

Effective date / 生效日期：2026-09-09

## English

### Overview

Leafmark replaces the browser's new tab with a bookmark-focused page. Leafmark has no developer account system, advertising, analytics, or service that receives bookmark lists or check results from users.

### Information processed

- **Bookmarks:** The extension reads bookmark titles, URLs, folder structure, and identifiers through the browser bookmarks API. It writes changes only for bookmark operations you request, such as editing, moving, deleting, or restoring.
- **Preferences:** Theme, home-folder selection, layout, display switches, and link-check timeout are saved using browser extension sync storage. Your browser may synchronize these preferences under its own account and sync settings.
- **Device-local data:** Uploaded wallpaper images, the latest deletion snapshot, restoration progress, selected check folder, and ignored domains are saved in extension local storage. A deletion snapshot contains bookmark titles, URLs, folders, and identifiers so that a requested deletion can be undone.
- **Link-check results:** Results are held in the current new-tab page's memory. Closing that page removes them.

### Network requests and third parties

When you start a link check and grant optional website access, Leafmark sends requests directly to the bookmarked HTTP/HTTPS websites and their redirects. The website operator can receive the requested URL and normal connection information, including your IP address. The URL's scheme determines transport: HTTP bookmarks may be checked over HTTP, and HTTPS bookmarks use HTTPS.

Check requests omit cookies and referrer information. URLs containing an embedded username or password are skipped. Leafmark does not load or execute the remote webpage's code. Opening a bookmark normally follows your browser's usual navigation and website privacy behavior.

The browser supplies favicons and may operate its own bookmark and settings sync services. Those browser services and the websites you visit have their own privacy policies. Leafmark does not upload bookmark lists, wallpapers, or check results to a developer-operated server or centralized checking service.

### Retention and control

Preferences remain until you change them or remove extension data. Only the latest deletion record is retained; it is replaced by the next successful deletion and cleared after a successful restore. Failed or interrupted restores retain progress to support retry. Changing or removing a wallpaper replaces or clears the locally stored image.

You can stop a running link check or close its panel. You can revoke website access in the browser's extension settings. Removing Leafmark removes its device-local extension data according to browser behavior; browser-synced data is controlled by the browser's own sync settings. Uninstalling does not reset the browser's bookmark tree; edits and deletions you already confirmed remain in effect.

### Use and disclosure

Data is used to provide the bookmark, appearance, and link-check features described above. The developer does not sell user data, use it for advertising, or use it to determine creditworthiness or lending eligibility. There is no developer backend access to a user's local bookmark or wallpaper data.

### Contact and changes

Questions can be sent through the project's public issue tracker: https://github.com/zcpin/leafmark/issues . Do not include private bookmark lists or sensitive URLs in public reports. Updates to this policy will appear in the project repository with an updated effective date.

## 简体中文

### 概述

叶签把浏览器新标签页替换为书签页面。叶签没有开发者账号体系、广告、遥测，也没有接收用户书签清单或检测结果的开发者服务。

### 处理的信息

- **书签：** 通过浏览器书签 API 读取标题、URL、目录结构和标识符。仅在你请求编辑、移动、删除或恢复等操作时写入书签变更。
- **偏好设置：** 主题、主页目录、布局、显示开关和检测超时使用浏览器扩展同步存储。浏览器可能按照自己的账号和同步设置同步这些偏好。
- **本机数据：** 上传壁纸、最近一次删除快照、恢复进度、检测目录和忽略域名保存在本机扩展存储。删除快照包含标题、URL、目录和标识符，用于撤销你请求的删除。
- **检测结果：** 只保留在当前新标签页的内存中，关闭该页面后消失。

### 网络请求与第三方

当你开始链接检测并授予可选网站访问权限后，叶签会直接请求收藏的 HTTP/HTTPS 网站及其重定向目标。网站运营者可以获得请求 URL、IP 地址等正常连接信息。传输方式取决于网址协议：HTTP 收藏可能通过 HTTP 检测，HTTPS 收藏通过 HTTPS 检测。

检测请求不携带 Cookie 和 Referer，包含内嵌用户名或密码的网址会被跳过。叶签不加载或执行远程页面代码。正常打开书签时，仍遵循浏览器和目标网站的通常访问及隐私行为。

网站图标由浏览器提供；浏览器也可能运行自己的书签及设置同步服务。浏览器服务和目标网站各自适用其隐私政策。叶签不把书签清单、壁纸或检测结果上传到开发者服务器或集中检测服务。

### 保存期限与控制

偏好设置保留至你修改或移除扩展数据。只保留最近一次删除记录，下一次成功删除时替换，成功恢复后清空；恢复失败或中断时保留进度以便重试。替换壁纸或切换为渐变背景会替换或清除本机图片。

你可以停止检测或关闭检测面板，并在浏览器扩展设置中撤销网站访问权限。移除叶签会按浏览器行为移除本机扩展数据；浏览器同步的数据由浏览器同步设置控制。卸载不会重置浏览器的书签树，已经确认的编辑或删除仍然有效。

### 使用与披露

数据用于上述书签、外观和链接检测功能。开发者不出售用户数据，不将其用于广告、信用评估或贷款资格判断。开发者没有可访问用户本机书签或壁纸数据的后端服务。

### 联系与更新

可通过公开的问题跟踪页面联系项目：https://github.com/zcpin/leafmark/issues 。公开反馈时请不要附上私人书签清单或敏感 URL。政策更新会公布在项目仓库中，并更新生效日期。
