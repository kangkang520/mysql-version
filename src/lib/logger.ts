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
			warning: isSupported ? '⚠' : '!!',
			error: isSupported ? '✖' : '×',
		}
	})()
	const colorDict: { info: 'blue', success: 'green', warning: 'yellow', error: 'red' } = {
		info: 'blue',
		success: 'green',
		warning: 'yellow',
		error: 'red',
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
		console.log(vals)
	}


	function outLog(tag: string, type: keyof Icon, msg: string) {
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
