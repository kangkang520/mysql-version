
//子进程的最大缓存
export const MAX_BUFFER = 1024 * 1024 * 1024 * 1024 * 1024 * 1024		//应该来说够大了，1EB

//备份文件标识
export const BACKUP_FILE_TAG = Buffer.from([
	//C    A    N     D      Y    D     B      B    A      K     END
	0x43, 0x41, 0x4E, 0x44, 0x59, 0x44, 0x42, 0x42, 0x41, 0x4B, 0x89,
])