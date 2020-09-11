import path from 'path'
import fs from 'fs'
import { dbu } from '../lib/mysql'
import { logger } from '../lib/logger'

/** 数据库升级选项 */
export interface IUpdateOption {
	/** 版本文件存放位置 */
	versionDir: string
	/** 要升级到的版本号，默认最新版本 */
	version?: string
	/** 数据库配置 */
	databaseConfig: dbu.IMysqlConnOption & {
		/** 数据库名 */
		database: string
	}
}


//加载版本文件
function loadVersions(versionDir: string) {
	fs.readdirSync(versionDir).forEach(file => {
		const ext = path.extname(file)
		if (ext == '.js' || ext == '.ts') require(path.join(versionDir, file))
	})
	return dbu.getVersions()
}

/**
 * 开始版本升级
 * @param version 版本号，如果为true表示升级到最新
 */
export async function update(option: IUpdateOption) {
	let conn: ReturnType<typeof dbu.getConnection> | undefined
	try {
		//加载版本文件并排序
		const versions = loadVersions(option.versionDir).sort((v1, v2) => {
			if (v1.ver == v2.ver) return 0
			return (v1.ver > v2.ver) ? 1 : -1
		})
		const vdict: { [i: number]: number } = {}
		versions.forEach(vi => {
			vi.ver = parseFloat(vi.ver.toFixed(2))
			if (vi.ver <= 0) throw new Error('version cannot <0')
			if (vdict[vi.ver]) throw new Error(`got same version ${vi.ver} in versions`)
			vdict[vi.ver] = vi.ver
		})
		if (!versions.length) throw new Error('no version found')
		const dest = option.version ? parseFloat(option.version) : versions[versions.length - 1].ver
		if (!versions.some(v => v.ver == dest)) throw new Error(`unknown version ${dest}`)
		//创建数据库连接
		const conf = option.databaseConfig
		conn = dbu.getConnection(option.databaseConfig)
		//数据库初始化
		const dbs = await conn.query('show databases')
		if (!dbs.some(di => di.Database == conf.database)) {
			logger.info('update', `initial database [${conf.database}]`)
			await conn.exec('create database ?? default character set = ?', conf.database, conf.charset)
			//创建版本表
			await conn.mktbl(`${conf.database}._ver`)
				.column('ver', 'decimal', { length: '20,2', comment: '版本号' })
				.column('ctime', 'datetime', { comment: '版本创建时间' })
				.primary('ver')
				.index('ctime')
				.done()
		}
		await conn.use(conf.database)
		//获取版本列表
		const dbVersions = await conn.query<{ ver: number }>('select * from _ver order by ver asc').then(res => res.map(vi => vi.ver))
		//获取开始版本
		const [fromVer] = versions.filter(v => !dbVersions.some(dv => dv >= v.ver))
		if (!fromVer) logger.warn('updater', 'nothing to be updated')
		else {
			//开始升级
			let updated = false
			for (let i = 0; i < versions.length; i++) {
				const { ver, program } = versions[i]
				//如果数据库中存在更高的版本则忽略
				if (dbVersions.some(dbv => dbv >= ver)) continue
				//如果高于给定版本则忽略
				if (ver > dest) continue
				//否则进行升级
				await program(conn)
				//写入版本号
				await conn.exec('insert into _ver set ?', { ver, ctime: new Date() })
				updated = true
			}
			if (updated) logger.success('update', `update database to ${dest} successfully`)
			else logger.warn('updater', 'nothing to be updated')
		}
		conn.close()
		conn = undefined
	} catch (err) {
		logger.error('update', err.message)
		if (err.sql) console.log(err.sql)
		if (conn) conn.close()
		throw err
	}
}