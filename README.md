# 坐井观天

中文 Chrome 新标签页扩展。清宋字体、网点纸页、七分类导航与 21 张漫画原画边框。

支持网站增删改与分类、书签导入预览、全网搜索与本页查找、本地草稿与回收区、主页点击统计及 JSON 导入导出。数据只保存在本机，不读取浏览历史，不修改原 Chrome 书签。

## 安装

下载或克隆仓库，打开 chrome://extensions，开启开发者模式，选择“加载已解压的扩展程序”，选择 extension 文件夹。无需构建或安装依赖。

仓库只提供通用示例网站。首次使用可在页面中授权读取 Chrome 书签并预览导入。个人书签、统计、备份与旧原型未上传。

## 开发与检查

直接编辑 extension 中的 HTML、CSS 和 JavaScript。修改后在扩展管理页重新加载。

使用 Node.js 24 执行：

```sh
node checks/check-release-core.cjs
node checks/check-release-package.cjs
node checks/check-release-draft.cjs
```

检查覆盖数据校验、存储与恢复、跨标签草稿竞争、包资源和布局几何。已完成本机浏览器 QA；真实 Chrome 安装、权限和后台生命周期仍需人工验证。视觉和动画继续打磨。

## 来源

动效使用 Anime.js 4.5.0：https://github.com/juliangarnier/anime 。本地版本及 MIT 许可证保存在 extension/vendor。

漫画素材为《死神》露琪亚原作参考，来源记录见 extension/assets/sources.json；相关权利归原权利人所有，未声明为 MIT 或已获再分发授权。此仓库用于个人项目保存。

此上传副本与本机个性化版本的差别仅为示例书签、独立运行的检查和仓库说明。运行代码与 21 张 WebP 图片保持原样。
