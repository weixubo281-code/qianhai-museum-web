# 深圳前海自然博物馆 · 三维滚动网站

线上站点：[GitHub Pages](https://weixubo281-code.github.io/qianhai-museum-web/)。本地开发地址：**http://127.0.0.1:4186/**。

## 运行

本机依赖已经准备完毕，运行 `npm run dev`，或执行 `start-local.ps1`。复制项目到新机器后先执行 `npm ci`，建议 Node.js 22 或更新版本。`npm run build` 生成 dist，`npm run preview` 可预览构建产物；与开发服务使用相同端口，不能同时占用。

## 目录

```text
qianhai-museum-web/
├── index.html                 六屏语义内容、导航、弹窗与回退
├── src/
│   ├── main.js                GLB、场景、灯光、滚动镜头与交互
│   ├── style.css              原设计稿排版及移动端布局
│   └── refinements.css        氛围融合与边缘渐隐
├── public/assets/             双规格GLB、环境、照片、海报
├── design-reference/          原始六屏设计稿
├── source-reference/          五张原始建筑照片
├── source/blender/            可编辑 Blender 工程、材质和建模脚本
├── asset-index.json           本项目资源归属、比例与模型统计
├── 视觉还原规范.md             固定配色、排版、场景和镜头规范
├── tools/                     Blender导出、资源处理、浏览器测试
├── work/source-objects.json   原始对象名称与变换记录
├── qa/                        桌面/手机截图与测试报告
└── dist/                      本地生产构建
```

推送到 `main` 后，GitHub Actions 使用 Node 22 构建并自动部署 GitHub Pages；本地构建默认使用根路径。需要在本机验证 Pages 路径时，设置 `DEPLOY_BASE=/qianhai-museum-web/` 后执行 `npm run build`。

原始 Blender 工程与材质工程收录于 `source/blender/`，可在独立克隆的仓库内重新导出模型。

## 实现

- Vite 7、Three.js 0.180、Meshopt。一个持久场景由六个连续关键帧驱动，插值舞台尺寸、镜头位置、观察目标、灯光和外层位移。使用原生文档滚动，没有锁滚轮或六页硬切。
- 首页正面全景、第二屏侧前方视角、第三屏屋顶与天窗外部层次、第四屏材质聚焦与镜头放大、第五屏三栏图文故事、第六屏全景复位与拖动/键盘环绕。
- Blender 将原始网格和曲线实际转换为 GLB。原模型没有动画或父子结构；网页增加五个语义根组，将静态同材质对象批处理为21个网格。全部变换与来源保留在索引和清单中。
- GLB 保留源 PBR 因子、UV与命名分组。源模型没有外部图像贴图。网页玻璃采用反射和桌面透射，手机以反射近似玻璃；程序化水面代替原 Blender 水波节点。
- 环境是用户照片的天空/山景裁片与实际三维景观组合。左上暖主光、冷环境光、反射环境、PCF阴影、SSAO、克制Bloom、细节景深及解析高度雾。高度雾以视线长度和指数高度积分近似光学厚度，不是高成本的多重散射路径追踪。
- 手机保留建筑及窗框结构，只对树冠与树枝减面，并略增细窗框厚度以减少亚像素闪烁。手机关闭AO/Bloom/景深，使用独立LOD、DPR上限、低帧率自适应与按需绘制。静止画面不持续浪费渲染帧，页面隐藏暂停。
- 在首帧显示建筑海报。模型请求失败或浏览器无WebGL仍可阅读网站，并能重试。支持减少动态偏好、直接章节链接、键盘焦点、Esc关闭、手机导航和原生触摸滚动。

## 重建资源

使用 Blender 5.0 后台执行 `tools/export_blender.py`，再执行 `npm run assets`。脚本读取原始 Blender 工程并导出派生GLB，不写回源工程。`asset-index.json` 中含原文件 SHA-256。图片源已经复制入项目，不依赖临时剪贴板文件。

运行时并不需要 Blender；全部网页资源均在 public/assets 中。开发依赖使用 sharp 0.34.4 override，避免 Windows 同时加载两套 sharp/libvips 版本。

## 验证

`npm test` 实际启动桌面Chrome进行交互验证并输出 `qa/report.json`。覆盖六屏正反滚动、导航、外层展开/复位、特写与缩放、图文弹窗、环绕重置、手机390×844和360×740、原生触摸、GLB失败重试、WebGL不可用、减少动态与深链接。截图在 qa 目录。

本次最终运行：72项交互/资源/布局检查通过，未捕获未处理JavaScript错误。生产构建另通过桌面与手机版本的首页、结构页、收尾页检查，记录在 qa/production-report.json。测试机连续过渡采样约59–60fps，手机模拟采用低功耗约30fps；静止状态按需停止绘制，因此首屏采样为0不代表卡顿。

开发服务器忽略原始图片、导出工作目录和测试截图的文件监听，避免Windows在大图片复制时触发EBUSY导致预览退出。

参考技术文档：[GLTFLoader](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)、[Three.js 后处理](https://threejs.org/manual/en/post-processing.html)。

## 已知差距与后续建议

当前网站可交互运行，但仍不能称为与最初生图逐像素一致或已经达到 Apple 的最终商业制作水准：现有 Blender 模型为近似外观重建，开口形状、屋顶轮廓与原参考有差异，树木和地面是简化几何，未补造馆内展陈。

第三屏表达已有外表皮层次，不表示真实施工安装顺序。未使用未经提供的品牌数据、票务信息或历史资料。

测试中的手机是桌面Chrome模拟，尚未进行真实iPhone/Safari与低端Android测试；测试机帧率不能代表所有设备。下一轮应优先精修建筑几何、替换真实植物资产及补充材质细节，然后在实际移动设备上分析GPU耗时、玻璃效果和功耗。

有正式品牌字体、工程尺寸和内部展示资料后，再进行精确字体匹配、测绘级比例与真实空间内容制作。
