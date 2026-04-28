export interface ChaosQuote {
  /** 名言正文（中文或英文），最大 120 字符 */
  quote: string;
  /** 作者/出处，最大 60 字符 */
  author: string;
}

/**
 * 混沌名言集合。
 * 加载期间每 5 秒轮播一条。
 */
export const CHAOS_QUOTES: ChaosQuote[] = [
  {
    quote: "云彩不是球体，山峦不是锥体，海岸线不是圆形，树皮并不光滑，闪电也不沿直线传播。",
    author: "Benoit Mandelbrot, 《大自然的分形几何》",
  },
  {
    quote: "确定性系统的内在随机性——这就是混沌。",
    author: "James Gleick, 《混沌：开创新科学》",
  },
  {
    quote: "当预报时段翻倍，误差便呈指数增长——两周是天气预测的极限。",
    author: "Edward Lorenz",
  },
  {
    quote: "简单的规则可以产生无法预测的行为。",
    author: "Stephen Wolfram",
  },
  {
    quote: "每一个分叉都导向无数可能的未来，而初始条件的微小差异将决定你落在哪一条轨迹上。",
    author: "Ilya Prigogine",
  },
  {
    quote: "周期三意味着混沌。",
    author: "Li & Yorke, 《Period Three Implies Chaos》",
  },
  {
    quote: "宇宙并非钟表，而是一片不断分叉的河流。",
    author: "《双摆混沌实验室》",
  },
  {
    quote: "蝴蝶在巴西轻拍翅膀，会在德克萨斯引起龙卷风吗？敏感依赖让长期预测成为不可能。",
    author: "Edward Lorenz, 蝴蝶效应",
  },
];
