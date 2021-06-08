import fs from 'fs'
import path from 'path'
import zlib from 'zlib'
import moment from 'moment'
import stream from 'stream'
import { exec } from 'child_process'
import { createCryptStream, mkdirp } from '../lib/utils'
import { dbu } from '../lib/mysql'
import { logger } from '../lib/logger'
import { BACKUP_FILE_TAG, MAX_BUFFER } from '../lib/const'

interface IFilenameGeneratorOption {
	/** 数据库名称 */
	dbname: string
	/** 版本号xx.xx */
	version: number
}

/** 数据库备份选项 */
export interface IBackupOption {
	/** 
	 * 文件名生成器
	 * 
	 * 使用此选项，请保证文件名按照一定的规则升序排列，否则在恢复时可能会出现问题
	 * @param option 生成器选项
	 */
	filenameGenerator?: (option: IFilenameGeneratorOption) => string
	/** 备份文件加密密码 */
	fileEncryptPassword?: string | Buffer
	/** 备份目录 */
	backupDir: string
	/** 备份文件标记 */
	backupFileTag?: string | Buffer
	/** 数据库配置 */
	databaseConfig: dbu.IMysqlConnOption & {
		/** 数据库名 */
		database: string
	}
}

/**
 * 备份数据库
 * @param option 备份选项
 */
export async function backup(option: IBackupOption) {
	let conn: ReturnType<typeof dbu.getConnection> | undefined
	try {
		if (!option.backupFileTag) option.backupFileTag = BACKUP_FILE_TAG
		let dirname = option.backupDir
		if (!dirname) throw new Error(`backup directory is required`)
		//系统检测
		dirname = path.resolve(process.cwd(), dirname)
		if (!fs.existsSync(dirname)) mkdirp(dirname)
		else if (!fs.statSync(dirname).isDirectory()) throw new Error(`backup directory ${dirname} is not directory`)
		//连接数据库
		conn = dbu.getConnection(option.databaseConfig)
		conn.use(option.databaseConfig.database)
		//检测是否能够备份
		const dbs = await conn.query('show databases')
		//生成备份名
		let filename = `${moment().format('YYYYMMDD-HHmmss')}.bak`
		if (option.filenameGenerator) {
			const res = await conn.query('select * from _ver order by ver desc limit 1')
			const ver = res[0].ver
			filename = option.filenameGenerator({
				version: ver,
				dbname: option.databaseConfig.database
			})
		}
		const outfile = path.join(dirname, filename)
		conn.close()
		conn = undefined
		//如果数据库不存在则不备份
		if (!dbs.some(dbi => dbi.Database == option.databaseConfig.database)) logger.warn('backup', 'nothing to be done')
		//开始备份数据库
		else {
			await new Promise<void>(resolve => {
				//创建文件输出流
				const ws = fs.createWriteStream(outfile)
				ws.write(option.backupFileTag)
				const gzip = zlib.createGzip()
				//开始备份
				const cmd = [
					'mysqldump --hex-blob',
					...option.databaseConfig.username ? [`-u${option.databaseConfig.username}`] : [],
					...option.databaseConfig.password ? [`-p${option.databaseConfig.password}`] : [],
					`-h"${option.databaseConfig.host || 'localhost'}" -P${option.databaseConfig.port || 3306} "${option.databaseConfig.database}"`,
				].join(' ')
				const cp = exec(cmd, { maxBuffer: MAX_BUFFER })
				cp.stdout!.pipe(createCryptStream(option.fileEncryptPassword)).pipe(gzip).pipe(ws)
				ws.on('close', () => resolve())
			})
			logger.success('backup', `backup database to ${outfile}`)
		}
	} catch (err) {
		if (conn) conn.close()
		logger.error('backup', err.message)
		throw new err
	}
}