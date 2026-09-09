# 提审填写与审核备注

## 单一用途 / Single purpose

中文：把浏览器原生书签展示为新标签页，并提供与这些书签直接相关的预览、整理、打开和按需链接检查。

English: Replace the new tab with a view of the browser's bookmarks, with directly related folder previews, bookmark organization, opening, and on-demand link checking.

## 权限用途

| 权限 | 可直接填写的英文说明 | 中文说明 |
| --- | --- | --- |
| `bookmarks` | Read the user's bookmark tree to display it on the new tab, and apply user-requested edits, moves, deletions, and restores. | 展示原生书签，并执行用户请求的编辑、移动、删除和恢复。 |
| `favicon` | Display browser-provided website icons beside bookmarks. | 在书签旁展示浏览器提供的网站图标。 |
| `storage` | Save appearance preferences, uploaded wallpaper, the latest deletion snapshot and restore progress, and link-check settings. | 保存外观、上传壁纸、最近一次删除及恢复进度、检测配置。 |
| `tabGroups` | Name and color a tab group when the user opens all bookmarks in a folder. | 用户批量打开文件夹时，为标签组设置名称和颜色。 |
| Optional `http://*/*` and `https://*/*` | On explicit user request, check arbitrary bookmarked URLs and redirect targets. Access is requested at check start. Requests omit credentials and referrers; results stay in page memory. | 手动检测任意收藏网址和重定向目标；开始时申请授权，不携带 Cookie/Referer，结果保留在当前页面。 |

`tabs.create` 和 `tabs.group` 的调用不需要读取标签页 URL/标题的敏感 `tabs` 权限，因此没有声明该权限。扩展也没有固定 host permissions、content scripts 或后台 service worker。

## 远程代码

English: No remotely hosted code is loaded or executed. All extension JavaScript, CSS, icons, bundled wallpapers, and QR generation code are packaged in the extension. Link checking reads HTTP response status and cancels the response body; it does not execute website code.

中文：不加载或执行远程代码。扩展脚本、样式、图标、预设壁纸和二维码逻辑均打包在本地。链接检测读取 HTTP 响应状态并取消正文，不执行网站代码。

## 数据披露依据

- 本地处理书签的标题、URL 和目录，保存偏好、壁纸、撤销记录及恢复进度。
- 设置可能由浏览器自身同步；链接检测经用户操作和授权后，直接向目标网站发送 URL 和正常连接信息。
- 不读取浏览器历史记录，不采集行为统计，没有开发者数据接收服务，不出售数据或用于广告。
- 按后台当前的数据类别定义如实填写；不能把“没有开发者服务器”理解成“不处理用户数据”。政策 URL 必须指向公开可访问的完整政策。

## 审核备注 / Reviewer notes

No test account, login, subscription, or payment is required.

1. Install the extension and open a new tab. If the browser asks whether to keep the new-tab change, keep Leafmark enabled.
2. Complete or skip the three-step onboarding. The extension reads bookmarks already present in this browser profile.
3. In a test browser profile, add a folder with a few test bookmarks. Hover the folder to preview it; add a nested folder to check cascading. Right-click to edit or choose the home folder.
4. For a deletion check, delete a test bookmark and use Undo. Only the most recent deletion batch is retained. Existing personal bookmarks are not required for review.
5. Open Settings → General → Find duplicate bookmarks. Two bookmarks with the exact same URL form a group; the UI keeps at least one copy.
6. Open the link-check tool, select a test folder, and start the check. Accept optional website access if you want to run the check. Review results or stop the task; deleting results requires confirmation.
7. Change appearance or layout, then reopen a new tab to verify persistence. Ctrl/Command-click or middle-click opens a bookmark in the background; Open all creates a tab group when multiple links succeed.

The screenshots use demonstration bookmarks. They show the actual extension interface; the promotional tiles are brand artwork. Network status is not a guarantee that a page is permanently unavailable, so the UI supports opening links for verification before deletion.
