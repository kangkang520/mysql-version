# MySQL数据库升级管理工具

如无这方面需求的，勿使用。

此工具用于对数据库进行升级管理，包括：

* 数据库升级
* 数据库备份
* 数据库恢复

此工具会在数据库中创建一张`_ver`表，用来进行数据库版本控制。

## 数据库升级

使用工具提供的`update`函数进行升级，升级前需要先定义版本，定义版本可以使用工具提供的`dbu.version`进行定义。

### 版本定义
一般来说会建立一个数据库版本文件夹，该文件夹中存放版本文件，每个版本文件中可以定义多个子版本，版本号是浮点数，小数占两位
```typescript
//定义1.01版本
dbu.version(1.01, async conn=>{
	//这里是该版本的升级代码
	await conn.mktbl(...)
	// ... ...
})
```

## 数据库备份

使用工具提供的`backup`函数进行数据库备份

## 数据库恢复

使用工具提供的`restore`函数进行数据库恢复