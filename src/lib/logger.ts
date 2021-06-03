import chalk from 'chalk'
import moment from 'moment'

type Icon = {
	[P in 'info' | 'success' | 'warning' | 'error']: string
}

export namespace logger {
	const icon: Icon = (() => {
		const isSupported = process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color';
		return {
			info: isSupported ? 'ℹ' : 'i',
			success: isSupported ? '✔' : '√',
			warning: isSupported ? '⚠' : '!',
			error: isSupported ? '✖' : '×',
		}
	})()
	const colorDict: { info: 'blue', success: 'green', warning: 'yellow', error: 'red' } = {
		info: 'blue',
		success: 'green',
		warning: 'yellow',
		error: 'red',
	}

	let isLogShown = true

	export function showLog(show: boolean) {
		isLogShown = show
	}

	/**
	 * 清楚行并重新打印自负一层
	 * @param str 打印的字符串
	 * @param color 颜色
	 */
	export function logs(str: string, color = 36) {
		// if (!isLogShown) return
		if (!process.stdout || !process.stdout.writable) return

		process.stdout.write('\x1b[0K')		//清除行
		if (color !== undefined) process.stdout.write(`\x1b[${color}m`)
		process.stdout.write(str)
		if (color !== undefined) process.stdout.write(`\x1b[0m`)
		process.stdout.write('\x1b[0G')		//回到行首
	}

	/**
	 * 换行打印字符串
	 * @param str 打印的字符串
	 */
	export function logln(str: string) {
		// if (!isLogShown) return
		if (!process.stdout || !process.stdout.writable) return

		process.stdout.write('\x1b[0K')		//清除行
		process.stdout.write(str)
		process.stdout.write('\n')
	}

	/**
	 * 清除行
	 */
	export function clearLine() {
		process.stdout.write('\x1b[0K')
	}


	export function success(tag: string, msg: string) {
		outLog(tag, 'success', msg)
	}

	export function info(tag: string, msg: string) {
		outLog(tag, 'info', msg)
	}

	export function warn(tag: string, msg: string) {
		outLog(tag, 'warning', msg)
	}

	export function error(tag: string, msg: string) {
		outLog(tag, 'error', msg)
	}
	/**
	 * 输出值
	 * @param vals 要输出的值
	 */
	export function out(...vals: Array<any>) {
		if (isLogShown) console.log(vals)
	}


	function outLog(tag: string, type: keyof Icon, msg: string) {
		if (!isLogShown) return
		const colorName = colorDict[type]
		const time = moment().format('YYYY-MM-DD HH:mm:ss')
		console.log(''
			+ chalk[colorName](time) + ' '
			+ chalk.bold[colorName](icon[type]) + ' '
			+ chalk.bold[colorName]('[' + tag + ']') + ' '
			+ chalk[colorName](msg)
		)
	}
}
