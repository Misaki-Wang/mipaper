# Paper Queue (Later & Like) 功能实现总结

## 已完成的工作

### 1. 数据库 Schema
文件：`/Users/misaki/Code/cool_paper/supabase/paper_queue_schema.sql`

- 创建 `paper_queue` 表
- 支持 `later` 和 `like` 状态
- RLS 策略保护
- 数据迁移脚本（liked_papers → paper_queue）

**执行方式**：在 Supabase SQL Editor 中运行此文件

### 2. 核心逻辑模块
文件：`/Users/misaki/Code/cool_paper/site/paper_queue.js`

功能：
- `addToQueue(paper, context, status)` - 添加到队列
- `removeFromQueue(paperId)` - 移除
- `moveToLike(paperId)` - Later → Like
- `readQueue(status)` - 读取队列
- `syncQueue()` - 同步到 Supabase
- `bindQueueButtons(root, recordLookup)` - 绑定按钮

### 3. UI 页面
文件：
- `/Users/misaki/Code/cool_paper/site/queue.html` - 页面结构
- `/Users/misaki/Code/cool_paper/site/queue.js` - 页面逻辑

## 需要完成的集成步骤

### 步骤 1：修改 app.js 导入
在 `app.js` 顶部添加：
```javascript
import { bindQueueButtons, initQueue, subscribeQueue } from "./paper_queue.js";
```

### 步骤 2：初始化队列
在 `init()` 函数中添加：
```javascript
subscribeQueue(() => bindQueueButtons(document, likeRecords));
await initQueue();
```

### 步骤 3：添加按钮到 HTML
在论文列表的按钮区域添加 Later 和 Like 按钮：
```html
<button class="paper-link later-button" data-later-id="PAPER_ID">
  <span>Later</span>
</button>
<button class="paper-link like-button" data-like-id="PAPER_ID">
  <span>Like</span>
</button>
```

### 步骤 4：添加 CSS 样式
```css
.later-button.is-later {
  background: #ffa500;
}
.like-button.is-liked {
  background: #ff0000;
}
```

### 步骤 5：更新导航
在导航栏添加链接到 `queue.html`

## 数据流程

1. **添加到 Later**：用户点击 Later 按钮 → 保存到 localStorage → 同步到 Supabase
2. **Later → Like**：在 queue.html 中点击 Like 按钮 → 更新状态 → 同步
3. **删除**：点击 Remove → 从 localStorage 和 Supabase 删除

## 下一步

1. 在 Supabase 执行 SQL schema
2. 修改 app.js 集成按钮
3. 添加 CSS 样式
4. 测试功能
