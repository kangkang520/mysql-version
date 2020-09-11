import fs from 'fs'
import path from 'path'

/**
 * 递归创建目录
 * @param dir 目录路径
 */
export function mkdirp(dir: string) {
	if (!fs.existsSync(dir)) {
		mkdirp(path.dirname(dir))
		fs.mkdirSync(dir)
	}
}