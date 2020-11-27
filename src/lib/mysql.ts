import mysql from 'mysql'
import { logger } from './logger'

export namespace dbu {

	/** 数据库连接选项 */
	export interface IMysqlConnOption {
		/** 主机名，默认localhost */
		host?: string
		/** 端口，默认3306 */
		port?: number
		/** 用户名 */
		username?: string
		/** 用户密码 */
		password?: string
		/** 字符集，默认utf8mb4 */
		charset?: string
	}

	/** 数据库列类型 */
	type IColumnType = 'int' | 'bigint' | 'tinyint'
		| 'varchar' | 'char'
		| 'text' | 'longtext'
		| 'date' | 'time' | 'datetime' | 'timestamp'
		| 'json'
		| 'enum'
		| 'decimal'

	/** 列选项 */
	interface IColumnOption {
		/** 是否非空 */
		required?: boolean
		/** 是否自增 */
		inc?: boolean
		/** 注释 */
		comment?: string
		/** 类型长度 */
		length?: string | number
		/** 默认值 */
		default?: string | number | boolean | (() => string | number | boolean)
	}

	/** 列信息 */
	interface IColumnInfo {
		/** 列名称 */
		name: string
		/** 列类型 */
		type: IColumnType
		/** 类型长度 */
		length: string
		/** 注释 */
		comment: string
		/** 是否非空 */
		required: boolean
		/** 是否自增 */
		inc: boolean
		/** 默认值 */
		default?: string
	}

	/** 索引信息 */
	interface IIndexInfo {
		/** 类型 */
		type: 'index' | 'unique' | 'fulltext',
		/** 列名称 */
		columns: Array<string>
		/** 是否使用ngram分词器，在全文索引时可以设置 */
		ngram?: boolean
	}

	/** 外键级联选项 */
	interface ILinkRefOption {
		/** 更新选项 */
		update: 'restrict' | 'cascade' | 'set null' | 'no action' | 'set default'
		/** 删除选项 */
		delete: 'restrict' | 'cascade' | 'set null' | 'no action' | 'set default'
	}

	/**
	 * 生成键名称
	 * @param column 列信息
	 */
	function keyName(column: string | Array<string>) {
		if (typeof column == 'string') return column
		return column.join('_')
	}

	/**
	 * 将索引信息转换成SQL字符串
	 * @param info 索引信息
	 */
	function strIndex(info: IIndexInfo) {
		//索引名称
		const name = mysql.escapeId(keyName(info.columns))
		//索引类型
		const type = (info.type == 'index') ? 'index' : `${info.type} index`
		//索引列
		const cols = info.columns.map(c => mysql.escapeId(c)).join(',')
		//生成字符串
		var str = `${type} ${name}(${cols})`
		//ngram
		if (info.ngram && info.type == 'fulltext') str += ' with parser ngram'
		//完成
		return str
	}

	/** 表格创建器 */
	class TableMaker {

		private columns: Array<IColumnInfo> = []

		private indexes: Array<IIndexInfo> = []

		private links: Array<ILinkRefOption & { name: string, table: string, column: string }> = []

		private primaries: Array<string> = []

		constructor(private name: string, private exec: (sql: string) => any, private comment?: string) { }

		/**
		 * 添加一列
		 * @param name 列名称
		 * @param type 列类型
		 * @param comment 列注释
		 * @param length 列长度
		 */
		public column(name: string, type: IColumnType, option?: IColumnOption) {
			option = option || {}
			const required = (option.required === undefined) ? false : option.required
			const dft = (() => {
				if (option.default === undefined) return
				if (typeof option.default == 'function') return option.default() + ''
				return mysql.escape(option.default) + ''
			})()
			this.columns.push({ name, type, length: (option.length === undefined) ? '' : (option.length + ''), comment: option.comment || '', required, inc: !!option.inc, default: dft })
			return this
		}

		/**
		 * 添加索引
		 * @param column 列名称
		 * @param type 所有类型
		 */
		public index(column: string | Array<string>, type?: IIndexInfo['type'], option?: Pick<IIndexInfo, 'ngram'>) {
			const c = (column instanceof Array) ? column : [column]
			this.indexes.push({ columns: c, type: type || 'index', ...option })
			return this
		}

		/**
		 * 添加外键
		 * @param name 列名称
		 * @param table 表名称
		 * @param column 表中的列名称
		 * @param option 选项
		 */
		public link(name: string, table: string, column: string, option?: Partial<ILinkRefOption>) {
			option = option || {}
			this.links.push({ name, table, column, update: option.update || 'restrict', delete: option.delete || 'restrict' })
			return this
		}

		/**
		 * 定义主键
		 * @param names 主键列名称
		 */
		public primary(...names: Array<string>) {
			this.primaries = names
			return this
		}

		/**
		 * 定义大bingint类型的id列
		 * @param option 列选项
		 */
		public id(option?: IColumnOption) {
			this.column('id', 'bigint', { required: true, inc: true, ...option })
			this.primary('id')
			return this
		}

		/**
		 * 定义uuid类型的id列
		 * @param option 列选项
		 */
		public uuid(option?: IColumnOption) {
			this.column('id', 'varchar', { length: 255, required: true, ...option })
			this.primary('id')
			return this
		}

		/**
		 * 定义name列
		 * @param option 列选项
		 */
		public nameColumn(option?: IColumnOption) {
			return this.column('name', 'varchar', { length: 255, required: true, ...option })
		}

		/**
		 * 定义desc列
		 * @param option 列选项
		 */
		public descColumn(option?: IColumnOption) {
			return this.column('desc', 'longtext', option)
		}

		/** 
		 * 定义排序字段 
		 */
		public sortColumn() {
			return this.column('sort', 'bigint', { comment: '数据排序，一般在创建数据时填入ID即可' })
		}

		/**
		 * 定义删除位
		 */
		public liveColumn() {
			return this.column('_live', 'tinyint', { required: true, default: 1, comment: '删除位，0表示删除' })
		}

		/**
		 * 定义mkTime列
		 */
		public mkTimeColumn() {
			return this.column('mkTime', 'datetime', { default: () => `now()`, comment: '创建时间' })
		}

		/**
		 * 定义upTime列
		 * @param option 列选项
		 */
		public upTimeColumn() {
			return this.column('upTime', 'datetime', { default: () => `now()`, comment: '最后一次修改时间' })
		}

		/**
		 * 定义20,2的定点小数列
		 * @param name 列名称
		 * @param option 列选项
		 */
		public decimalNormal(name: string, option?: IColumnOption) {
			return this.column(name, 'decimal', { length: '20,2', ...option })
		}

		/**
		 * 定义ID类型(bigint)的外键
		 * @param name 列名称
		 * @param table 表名称
		 * @param field 字段名称
		 * @param option 外键选项
		 */
		public idLink(name: string, table: string, field: string, option?: IColumnOption & Partial<ILinkRefOption> & { primary?: boolean }) {
			const { update, delete: dlt, primary, ...columnOption } = option || {}
			this.column(name, 'bigint', columnOption)
			if (primary) this.primaries.push(name)
			this.link(name, table, field, {
				update: update,
				delete: dlt,
			})
			return this
		}

		/**
		 * 定义uuid类型的外键
		 * @param name 列名称
		 * @param table 表名称
		 * @param field 字段名称
		 * @param option 外键选项
		 */
		public uuidLink(name: string, table: string, field: string, option?: IColumnOption & Partial<ILinkRefOption> & { primary?: boolean }) {
			const { update, delete: dlt, primary, ...columnOption } = option || {}
			this.column(name, 'varchar', { length: 255, ...columnOption })
			if (primary) this.primaries.push(name)
			this.link(name, table, field, {
				update: update,
				delete: dlt,
			})
			return this
		}

		/**
		 * 定义完成
		 */
		public async done() {
			const mkcol = (col: IColumnInfo) => [
				mysql.escapeId(col.name),
				`${col.type}${col.length ? `(${col.length})` : ''}`,
				(col.required || this.primaries.includes(col.name)) ? `not null` : ``,
				col.inc ? 'auto_increment' : '',
				col.default ? `default ${col.default}` : '',
				col.comment ? `comment ${mysql.escape(col.comment)}` : ''
			].filter(s => !!s).join(' ')

			const sql = `create table ${mysql.escapeId(this.name)} (${[
				...this.columns.map(col => mkcol(col)),
				this.primaries ? `primary key (${this.primaries.map(p => mysql.escapeId(p)).join(',')})` : '',
				...this.indexes.map(i => strIndex(i)),
			].join(', ')})${this.comment ? ` comment=${mysql.escape(this.comment)}` : ''}`
			logger.info('update', `create table [${this.name}]`)
			await this.exec(sql)
			//等表创建完成之后，单独添加外键
			for (let i = 0; i < this.links.length; i++) {
				const link = this.links[i]
				const linkstr = [
					`foreign key (${mysql.escapeId(link.name)}) references ${mysql.escapeId(link.table)}(${mysql.escapeId(link.column)})`,
					`on update ${link.update}`,
					`on delete ${link.delete}`,
				].filter(s => !!s).join(' ')
				await this.exec(`alter table ${mysql.escapeId(this.name)} add ${linkstr}`)
			}
		}
	}

	/** 列修改器 */
	class ColumnUpdater {
		constructor(private dbname: string, private tableName: string, private colname: string, private exec: (sql: string) => any) { }

		//获取列信息
		private async columnInfo(name: string) {
			const getType = (t: string) => {
				const match = t.match(/^(\S+?)(\(([\s\S]+?)\))?$/)!
				return {
					type: match[1] as IColumnType,
					length: match[3],
				}
			}
			const [res] = await this.exec(`select * from information_schema.COLUMNS where TABLE_SCHEMA=${mysql.escape(this.dbname)} and TABLE_NAME=${mysql.escape(this.tableName)} and COLUMN_NAME=${mysql.escape(name)}`)
			const result: IColumnInfo = {
				name: res.COLUMN_NAME,
				...getType(res.COLUMN_TYPE),
				comment: res.COLUMN_COMMENT,
				required: res.IS_NULLABLE == 'NO',
				inc: res.EXTRA == 'auto_increment',
				default: res.COLUMN_DEFAULT,
			}
			return result
		}

		//生成列SQL语句
		private mkcol(col: IColumnInfo) {
			return [
				mysql.escapeId(col.name),
				`${col.type}${col.length ? `(${col.length})` : ''}`,
				(col.required) ? `not null` : ``,
				col.inc ? 'auto_increment' : '',
				col.default ? `default ${mysql.escape(col.default)}` : '',
				col.comment ? `comment ${mysql.escape(col.comment)}` : ''
			].filter(s => !!s).join(' ')
		}

		/**
		 * 重命名列
		 * @param to 新名字
		 */
		public async rename(to: string) {
			const info = await this.columnInfo(this.colname)
			info.name = to
			logger.info('update', `alter column [${this.tableName}.${this.colname}] rename to [${to}]`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)}`)
		}

		/**
		 * 修改表类型
		 * @param type 新的类型
		 * @param length 类型的长度，有长度的必须指定
		 */
		public async type(type: IColumnType, length?: string | number) {
			const info = await this.columnInfo(this.colname)
			info.type = type
			info.length = length ? length + '' : ''
			logger.info('update', `alter column [${this.tableName}.${this.colname}] type to ${type}`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)}`)
		}

		/**
		 * 修改自增信息
		 * @param inc 是否自增
		 */
		public async inc(inc: boolean) {
			const info = await this.columnInfo(this.colname)
			info.inc = inc
			logger.info('update', `alter column [${this.tableName}.${this.colname}] increment to ${inc ? 'TRUE' : 'FALSE'}`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)}`)
		}

		/**
		 * 修改是否非空信息
		 * @param req 是否非空
		 */
		public async required(req: boolean) {
			const info = await this.columnInfo(this.colname)
			info.required = req
			logger.info('update', `alter column [${this.tableName}.${this.colname}] ${req ? 'not null' : 'null'}`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)}`)
		}

		/**
		 * 修改默认值
		 * @param defaultVal 默认值
		 */
		public async default(defaultVal: IColumnOption['default']) {
			const info = await this.columnInfo(this.colname)
			info.default = (() => {
				if (typeof defaultVal == 'function') return defaultVal() + ''
				return defaultVal + ''
			})()
			logger.info('update', `alter column [${this.tableName}.${this.colname}] default value to ${info.default}`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)}`)
		}

		/**
		 * 修改注释
		 * @param comment 注释
		 */
		public async comment(comment: string) {
			const info = await this.columnInfo(this.colname)
			info.comment = comment
			logger.info('update', `alter column [${this.tableName}.${this.colname}] comment to ${comment}`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)}`)
		}

		/**
		 * 移动列到某列之后
		 * @param column 列名称
		 */
		public async after(column: string) {
			const info = await this.columnInfo(this.colname)
			logger.info('update', `alter column [${this.tableName}.${this.colname}] move after [${column}]`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)} after ${mysql.escapeId(column)}`)
		}

		/**
		 * 移动列到最开始
		 */
		public async first() {
			const info = await this.columnInfo(this.colname)
			logger.info('update', `alter column [${this.tableName}.${this.colname}] move to first`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} change ${mysql.escapeId(this.colname)} ${this.mkcol(info)} first`)
		}

	}

	/** 表格修改器 */
	class TableUpdater {
		constructor(private dbName: string, private tableName: string, private exec: (sql: string) => any) { }

		//获取外键信息
		private async foreignKeyOf(column: string) {
			const sql = `select k.CONSTRAINT_NAME, k.TABLE_NAME, k.COLUMN_NAME ,k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME, c.UPDATE_RULE, c.DELETE_RULE from information_schema.KEY_COLUMN_USAGE k join information_schema.REFERENTIAL_CONSTRAINTS c on c.CONSTRAINT_NAME=k.CONSTRAINT_NAME where k.TABLE_SCHEMA=${mysql.escape(this.dbName)} and k.TABLE_NAME=${mysql.escape(this.tableName)} and k.COLUMN_NAME=${mysql.escape(column)}`
			const [key] = await this.exec(sql)
			// const [key] = keys.filter(key => key.REFERENCED_TABLE_SCHEMA && key.REFERENCED_TABLE_NAME && key.REFERENCED_COLUMN_NAME)
			if (!key) return null
			return {
				name: key.CONSTRAINT_NAME,
				fromTable: key.TABLE_NAME,
				fromColumn: key.COLUMN_NAME,
				toTable: key.REFERENCED_TABLE_NAME,
				toColumn: key.REFERENCED_COLUMN_NAME,
				onUpdate: key.UPDATE_RULE,
				onDelete: key.DELETE_RULE,
			}
		}

		//获取主键列表
		private async primaryKeys(): Promise<Array<string>> {
			const keys = await this.keys()
			for (let i = 0; i < keys.length; i++) {
				if (keys[i].name == 'PRIMARY') return keys[i].columns
			}
			return []
		}

		//获取索引列表
		private async keys() {
			const sql = `select * from information_schema.STATISTICS where TABLE_SCHEMA=${mysql.escape(this.dbName)} and TABLE_NAME=${mysql.escape(this.tableName)}`
			const keys: Array<any> = await this.exec(sql)
			const buffer: Array<{ name: string, columns: Array<string> }> = []
			keys.forEach(key => {
				for (let i = 0; i < buffer.length; i++) {
					if (buffer[i].name == key.INDEX_NAME) {
						buffer[i].columns.push(key.COLUMN_NAME)
						return
					}
				}
				buffer.push({
					name: key.INDEX_NAME,
					columns: [key.COLUMN_NAME]
				})
			})
			return buffer
		}

		/**
		 * 修改表注释
		 * @param comment 表注释
		 */
		public async comment(comment: string) {
			logger.info('update', `alter table [${this.tableName}] set comment`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} comment ${mysql.escape(comment)}`)
		}

		/**
		 * 重命名表
		 * @param to 新名字
		 */
		public async rename(to: string) {
			logger.info('update', `rename table [${this.tableName}] to [${to}]`)
			await this.exec(`rename table ${mysql.escapeId(this.tableName)} to ${mysql.escapeId(to)}`)
		}

		/**
		 * 设置主键
		 * @param names 主键名称
		 */
		public async primary(...names: Array<string>) {
			if (names.length) logger.info('update', `alter table [${this.tableName}] set primary (${names.join(',')})`)
			else logger.info('update', `alter table [${this.tableName}] drop primary`)
			//获取主键列表
			const keys = await this.primaryKeys()
			if (keys.length) await this.exec(`alter table ${mysql.escapeId(this.tableName)} drop primary key`)
			if (names.length) await this.exec(`alter table ${mysql.escapeId(this.tableName)} add primary key (${names.map(n => mysql.escapeId(n)).join(',')})`)
		}

		/**
		 * 添加列
		 * @param name 列名称
		 * @param type 列类型
		 * @param option 列选项
		 */
		public async addColumn(name: string, type: IColumnType, option?: IColumnOption) {
			const { length = '', required = false, inc = false, comment = undefined, default: dftv = undefined } = option || {}
			const dft = (() => {
				if (dftv === undefined) return
				if (typeof dftv === 'function') return dftv() + ''
				return mysql.escape(dftv)
			})()
			const mkcol = () => [
				mysql.escapeId(name),
				`${type}${length ? `(${length})` : ''}`,
				required ? `not null` : ``,
				inc ? 'auto_increment' : '',
				dft ? `default ${dft}` : '',
				comment ? `comment ${mysql.escape(comment)}` : ''
			].filter(s => !!s).join(' ')
			logger.info('update', `alter table [${this.tableName}] add column [${name}]`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} add column ${mkcol()}`)
		}

		/**
		 * 删除列
		 * @param name 列名称
		 */
		public async dropColumn(name: string) {
			logger.info('update', `alter table [${this.tableName}] drop column [${name}]`)
			await this.dropLink(name)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} drop column ${mysql.escapeId(name)}`)
		}

		/**
		 * 修改列
		 * @param name 列名称
		 */
		public column(name: string) {
			return new ColumnUpdater(this.dbName, this.tableName, name, this.exec)
		}

		/**
		 * 删除索引
		 * @param columns 索引列名称
		 */
		public async dropKey(columns: Array<string> | string) {
			logger.info('update', `alter table [${this.tableName}] drop index of [${columns}]`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} drop index ${keyName(columns)}`)
		}

		/**
		 * 添加索引
		 * @param columns 列名称
		 * @param type 索引类型
		 * @param option 索引选项
		 */
		public async addIndex(columns: Array<string> | string, type: IIndexInfo['type'] = 'index', option?: Pick<IIndexInfo, 'ngram'>) {
			columns = (columns instanceof Array) ? columns : [columns]
			//检测索引是否存在，如果存在则删除
			const kname = keyName(columns)
			const keys = await this.keys()
			if (keys.some(key => key.name == kname)) await this.dropKey(columns)
			//添加索引
			logger.info('update', `alter table [${this.tableName}] add index of [${columns}]`)
			const indexStr = strIndex({ columns, type, ...option })
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} add ${indexStr}})`)
		}

		/**
		 * 删除给定列的外键
		 * @param column 列名称
		 */
		public async dropLink(column: string) {
			const key = await this.foreignKeyOf(column)
			if (!key) return
			logger.info('update', `alter table [${this.tableName}] drop foreign key of [${column}]`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} drop foreign key ${mysql.escapeId(key.name)}`)
		}

		/**
		 * 添加外键
		 * @param name 要设置外键的字段名称
		 * @param table 目标表名称
		 * @param column 目标表列名称
		 * @param option 外键选项
		 */
		public async addLink(name: string, table: string, column: string, option?: Partial<ILinkRefOption>) {
			option = option || {}
			const ref = [
				option.update ? `on update ${option.update}` : '',
				option.delete ? `on delete ${option.delete}` : '',
			].filter(s => !!s).join(' ')
			logger.info('update', `alter table [${this.tableName}] add foreign key of [${column}]`)
			await this.exec(`alter table ${mysql.escapeId(this.tableName)} add foreign key (${mysql.escapeId(name)}) references ${mysql.escapeId(table)}(${mysql.escapeId(column)}) ${ref}`)
		}

		/**
		 * 设置外键（如果存在则先删除）
		 * @param name 要设置外键的字段名称
		 * @param table 目标表名称
		 * @param column 目标表列名称
		 * @param option 外键选项
		 */
		public async link(name: string, table: string, column: string, option?: Partial<ILinkRefOption>) {
			//删除外键
			await this.dropLink(name)
			//添加外键
			await this.addLink(name, table, column, option)
		}
	}

	/** MySQL连接 */
	class MyConnection {

		private conn: mysql.Connection

		private dbname?: string

		constructor(option: IMysqlConnOption) {
			this.conn = mysql.createConnection({
				host: option.host || 'localhost',
				port: option.port || 3306,
				user: option.username,
				password: option.password,
				charset: option.charset || 'utf8mb4'
			})
		}

		/**
		 * 连接数据库
		 */
		public async connect() {
			return new Promise((resolve, reject) => this.conn.connect((err, res) => err ? reject(err) : resolve()))
		}

		/**
		 * 关闭连接
		 */
		public close() {
			this.conn.end()
		}

		/**
		 * 使用给第数据库
		 * @param dbName 数据库名称
		 */
		public async use(dbName: string) {
			this.dbname = dbName
			await this.exec('use ??', dbName)
		}

		/**
		 * 执行sql查询语句
		 * @param sql SQL语句
		 * @param args 参数
		 */
		public async query<T = any>(sql: string, ...args: Array<any>): Promise<Array<T>> {
			return new Promise((resolve, reject) => this.conn.query(sql, args, (err, res) => err ? reject(err) : resolve(res)))
		}

		/**
		 * 执行SQL修改语句
		 * @param sql SQL语句
		 * @param args 参数
		 */
		public async exec(sql: string, ...args: Array<any>): Promise<any> {
			return new Promise((resolve, reject) => this.conn.query(sql, args, (err, res) => err ? reject(err) : resolve(res)))
		}

		/**
		 * 创建表
		 * @param name 表名称
		 * @param comment 表注释
		 */
		public mktbl(name: string, comment?: string) {
			return new TableMaker(name, this.exec.bind(this), comment)
		}

		/**
		 * 修改表信息
		 * @param name 表名称
		 */
		public uptbl(name: string) {
			if (!this.dbname) throw new Error('unknown database name when update table')
			return new TableUpdater(this.dbname, name, this.exec.bind(this))
		}

		/**
		 * 插入数据
		 * @param value 数据值
		 */
		public async insert(table: string, value: { [i: string]: any }): Promise<{ insertId: number | string }> {
			return await this.exec('insert into ?? set ?', table, value)
		}

		/**
		 * 插入多条数据
		 * @param values 数据值
		 */
		public async insertMany(table: string, values: Array<{ [i: string]: any }>): Promise<Array<number | string>> {
			const result = []
			for (let i = 0; i < values.length; i++) {
				const resi = await this.insert(table, values[i])
				result.push(resi.insertId)
				process.stdout.write(`              \x1b[0Gcomplate: ${parseInt((i + 1) * 100 / values.length as any)}% (${i + 1}/${values.length})`)
			}
			process.stdout.write(`\x1b[0G                      \x1b[0G`)
			return result
		}

		/**
		 * 数据修改
		 * @param table 表格
		 * @param key 主键列，可以是多个
		 * @param columns 要查询的列
		 * @param updater 更改器，这里面返回新的数据，如果返回undefined则不处理
		 */
		public async updata<T = any>(table: string, key: string | Array<string>, columns: Array<string>, updater: (oldData: T) => any) {
			logger.info('update', `updating ${table} for columns of ${columns.join(',')}`)
			//每次处理的数据量
			const everytime = 200
			//此函数用于更新部分数据，返回更新的数据量
			const updateSome = async (limit: number): Promise<number> => {
				const keys = (key instanceof Array) ? key : [key]
				const datas = await this.query(`select ${[...keys, ...columns].map(c => mysql.escapeId(c)).join(',')} from ${mysql.escapeId(table)} limit ${limit}, ${everytime}`)
				for (let i = 0; i < datas.length; i++) {
					const result = await updater(datas[i])
					if (result === undefined) continue
					//生成where条件
					const whereStr: Array<string> = []
					const whereParams: Array<string> = []
					keys.forEach(key => {
						whereStr.push('??=?')
						whereParams.push(key, datas[i][key])
					})
					//执行
					await this.exec('update ?? set ? where ' + whereStr.join(' and '), table, result, ...whereParams)
				}
				return datas.length
			}
			//开始更新，如果没有完成则一直更新
			let updated = 0
			while (true) {
				const count = await updateSome(updated)
				updated += count
				if (count < everytime) break
			}
			return updated
		}
	}

	/**
	 * 连接到数据库
	 * @param conf 连接配置
	 */
	export function getConnection(conf: IMysqlConnOption) {
		return new MyConnection(conf)
	}

	const versions: Array<{ ver: number, program: (conn: MyConnection) => Promise<void> }> = []

	/**
	 * 添加一个版本
	 * @param ver 版本号，使用浮点数（小数位占两位），例如3.02
	 * @param program 版本升级程序
	 */
	export function version(ver: number, program: (conn: MyConnection) => Promise<void>) {
		versions.push({ ver, program })
	}

	/**
	 * 获取版本列表
	 */
	export function getVersions() {
		return versions
	}
}
