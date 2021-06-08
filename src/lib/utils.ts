import fs from 'fs'
import path from 'path'
import stream from 'stream'

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

/**
 * 创建加解密流
 * @param password 密码
 * @returns 加解密流
 */
export function createCryptStream(password?: Buffer | string | null) {
	let index = 0
	return new stream.Transform({
		transform(chunk, encoding, callback) {
			//没有密码则不管
			if (!password || !password.length) return callback(null, chunk)
			//只允许字符串和Buffer
			if (typeof chunk == 'string') chunk = Buffer.from(chunk)
			else if (!(chunk instanceof Buffer)) throw new Error('Encrypt database data error [NOT_BUFFER]')
			//加密
			const buffer = Buffer.alloc(chunk.length)
			const _password = (password instanceof Buffer) ? password : Buffer.from(password)
			for (let i = 0; i < buffer.length; i++, index++) {
				buffer[i] = chunk[i] ^ _password[index % _password.length]
			}
			//完成
			callback(null, buffer)
		}
	})
}