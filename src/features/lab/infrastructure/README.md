# lab — Infrastructure 层

## 职责
实验模式的基础设施实现——Pyodide 加载与执行、缓存管理。

## 内容清单
### pyodide/
- `PyodideGateway.ts`: Pyodide 执行网关
### storage/
- `PyodideCacheManager.ts`: Pyodide 三级缓存管理（← pyodideCache.ts）
