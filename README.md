# 坐井观天

中文 Chrome 新标签页扩展。清宋字体、网点纸页、七分类导航与 21 张漫画原画边框。

当前版本 **1.1.1**。支持网站增删改与分类、书签导入预览、全网搜索与本页查找、本地草稿与回收区、主页点击统计及 JSON 导入导出；可选 Chrome 日常同步与 GitHub 私有完整备份。不读取浏览历史，不修改原 Chrome 书签。

## 安装

下载或克隆仓库，打开 chrome://extensions，开启开发者模式，选择“加载已解压的扩展程序”，选择 extension 文件夹。无需构建或安装依赖。

仓库只提供通用示例网站。首次使用可在页面中授权读取 Chrome 书签并预览导入。个人书签、统计、备份与旧原型未上传。

## 同步与备份

设置 → 同步与备份。Chrome 同步网站、设置和收纳；访问统计、草稿留在本机。同账号需开启浏览器扩展同步，两台设备扩展 ID 必须相同。解压安装路径可能影响 ID；不会自动把解压扩展安装到另一台设备。写入 storage.sync 不等于已验证 Google 云端送达。单个压缩快照限额 8KiB，超限拒绝而不截断；双边修改显示冲突。

GitHub 备份需要你自己的私有仓库及仅授权该仓库 Contents 读写的细粒度令牌。令牌直接填在扩展设置里，仅保存在设备本地，不进备份。上传完整数据至 backup.json；恢复先预览再确认。主动上传更新当前快照，旧版本保存在 Git 提交历史。源码提交与个人数据备份是两个动作；本仓库提交不代表已备份你的个人数据。

## 开发与检查

直接编辑 extension 中的 HTML、CSS 和 JavaScript。修改后在扩展管理页重新加载。

使用 Node.js 24 执行：

```sh
node checks/check-release-core.cjs
node checks/check-release-package.cjs
node checks/check-release-draft.cjs
node checks/check-stats.cjs
node checks/check-cloud.cjs
```

检查覆盖数据校验、存储与恢复、跨标签草稿竞争、包资源和布局几何，以及双设备同步冲突和私有备份边界。浏览器检查另需 Playwright 和本机 Chrome，运行 check-cloud-ui.cjs、check-visual-interactions.cjs、check-search-return.cjs。模拟测试不代表真实 Google 账号跨设备传播或 GitHub 私有备份已经接通。

## 来源

动效使用 Anime.js 4.5.0：https://github.com/juliangarnier/anime 。本地版本及 MIT 许可证保存在 extension/vendor。

漫画素材为《死神》露琪亚原作参考，来源记录见 extension/assets/sources.json；相关权利归原权利人所有，未声明为 MIT 或已获再分发授权。此仓库用于个人项目保存。

此上传副本与本机个性化版本的差别仅为示例书签、独立运行的检查和仓库说明。运行代码与 21 张 WebP 图片保持原样。
