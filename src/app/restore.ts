import zlib from 'zlib'
import path from 'path'
import fs from 'fs'
import { exec } from 'child_process'
import { BACKUP_FILE_TAG, MAX_BUFFER } from '../lib/const'
import { logger } from '../lib/logger'
import { dbu } from '../lib/mysql'
import { createCryptStream } from '../lib/utils'

export interface IRestoreOption {
	/** 备份文件创建时的加密密码 */
	fileEncryptPassword?: string | Buffer
	/** 备份目录 */
	backupDir: string
	/** 备份文件标记 */
	backupFileTag?: string | Buffer
	/** 恢复的文件名称 */
	file?: string
	/** 数据库配置 */
	databaseConfig: dbu.IMysqlConnOption & {
		/** 数据库名 */
		database: string
	}
}

/**
 * 恢复数据库
 * @param option 数据库恢复选项
 */
export async function restore(option: IRestoreOption) {
	let conn: ReturnType<typeof dbu.getConnection> | undefined
	try {
		let filename = option.file || (() => {
			if (!option.backupDir) return ''
			const [file] = fs.readdirSync(option.backupDir).reverse()
			if (!file) return ''
			return path.join(option.backupDir, file)
		})()
		if (!filename) throw new Error(`backup file is required`)
		const backupFileTag = option.backupFileTag ? Buffer.from(option.backupFileTag) : BACKUP_FILE_TAG
		//基本校验
		filename = path.resolve(process.cwd(), filename)
		if (!fs.existsSync(filename)) throw new Error(`file ${filename} not exists`)
		if (!fs.statSync(filename).isFile()) throw new Error(`file ${filename} is not a file`)
		//校验是否是备份文件
		const isBakFile = await new Promise<boolean>(resolve => {
			const is = fs.createReadStream(filename, { start: 0, end: backupFileTag!.length - 1 })
			is.on('data', di => {
				is.close()
				resolve(Buffer.compare(backupFileTag, Buffer.from(di)) == 0)
			})
			is.read(backupFileTag.length)
		})
		if (!isBakFile) throw new Error(`file ${filename} is not a backup file`)
		//连接数据库
		conn = dbu.getConnection(option.databaseConfig)
		//数据库重新初始化
		const dbs = await conn.query('show databases')
		if (dbs.some(dbi => dbi.Database == option.databaseConfig.database)) {
			logger.info('restore', `drop old database`)
			await conn.exec('drop database ??', option.databaseConfig.database)
		}
		logger.info('restore', `create new database ${option.databaseConfig.database}`)
		await conn.exec('create database ?? default character set = ?', option.databaseConfig.database, option.databaseConfig.charset || 'utf8mb4')
		conn.close()
		conn = undefined
		//开始备份
		await new Promise((resolve, reject) => {
			const cmd = [
				'mysql',
				...option.databaseConfig.username ? [`-u${option.databaseConfig.username}`] : [],
				...option.databaseConfig.password ? [`-p${option.databaseConfig.password}`] : [],
				`-h"${option.databaseConfig.host || 'localhost'}" -P${option.databaseConfig.port || 3306} "${option.databaseConfig.database}"`,
			].join(' ')
			//创建进程
			const cp = exec(cmd, { maxBuffer: MAX_BUFFER })
			cp.once('close', code => resolve((code == 0) ? true : false))
			//写入数据流
			const gunzip = zlib.createGunzip()
			gunzip.on('error', err => {
				cp.kill()
				reject(new Error('gunzip: ' + err.message))
			})
			fs.createReadStream(filename, { start: backupFileTag!.length }).pipe(gunzip).pipe(createCryptStream(option.fileEncryptPassword)).pipe(cp.stdin!)
		})
		logger.success('restore', `database restore successfully`)
	} catch (err) {
		logger.error('restore', err.message)
		if (conn) conn.close()
		throw err
	}
}