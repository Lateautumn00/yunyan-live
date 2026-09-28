import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { buildPptToPdfArgs, PPT_TO_PDF_TIMEOUT_MS } from './ppt-convert';

const execFileAsync = promisify(execFile);
const UPLOAD_DIR = join(process.cwd(), 'uploads');

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

interface UploadFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

@Controller('upload')
export class UploadController {
  private readonly logger = new Logger(UploadController.name);

  @Post('image')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (_req: Record<string, unknown>, file: { mimetype: string }, cb: (err: Error | null, accept: boolean) => void) => {
      if (!file.mimetype.match(/\/(jpg|jpeg|png|gif|bmp)$/)) {
        return cb(new BadRequestException('仅支持图片格式 (jpg/png/gif/bmp)'), false);
      }
      cb(null, true);
    },
  }))
  uploadImage(@UploadedFile() file: UploadFile) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }
    const dir = join(UPLOAD_DIR, 'images');
    ensureDir(dir);
    const filename = Date.now() + '-' + Math.round(Math.random() * 1e9) + extname(file.originalname);
    writeFileSync(join(dir, filename), file.buffer);
    this.logger.log(`图片上传成功: ${filename}`);
    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const fileUrl = `${baseUrl}/uploads/images/${filename}`;
    return { fileUrl };
  }

  @Post('ppt')
  @UseInterceptors(FileInterceptor('file', {
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req: Record<string, unknown>, file: { originalname: string }, cb: (err: Error | null, accept: boolean) => void) => {
      const name = file.originalname.toLowerCase();
      if (!name.endsWith('.ppt') && !name.endsWith('.pptx')) {
        return cb(new BadRequestException('仅支持 .ppt 和 .pptx 格式'), false);
      }
      cb(null, true);
    },
  }))
  async uploadPPT(@UploadedFile() file: UploadFile) {
    if (!file) {
      throw new BadRequestException('请选择文件');
    }

    const pptDir = join(UPLOAD_DIR, 'ppt');
    ensureDir(pptDir);

    const baseName = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const pptFilename = baseName + extname(file.originalname);
    const pptPath = join(pptDir, pptFilename);
    writeFileSync(pptPath, file.buffer);
    this.logger.log(`PPT上传成功: ${pptFilename}`);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    // LO 以输入文件名（baseName.pptx）命名输出，直出 pptDir/baseName.pdf
    const pdfUrl = `${baseUrl}/uploads/ppt/${baseName}.pdf`;
    const pdfPath = join(pptDir, `${baseName}.pdf`);

    try {
      const sofficePath =
        process.env.SOFFICE_PATH ||
        (process.platform === 'win32'
          ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
          : 'soffice');
      this.logger.log(`使用soffice路径: ${sofficePath}`);

      const pdfArgs = buildPptToPdfArgs(pptDir, pptPath);
      this.logger.log(`执行: ${sofficePath} ${pdfArgs.join(' ')}`);
      await execFileAsync(sofficePath, pdfArgs, { timeout: PPT_TO_PDF_TIMEOUT_MS });

      if (!existsSync(pdfPath)) {
        throw new Error('LibreOffice 未生成 PDF 文件');
      }
      this.logger.log(`PPT转PDF完成: ${baseName}.pdf`);
      return { fileUrl: pdfUrl };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`PPT转PDF失败: ${msg}`, (err as Error).stack);
      if (msg.includes('ENOENT')) {
        this.logger.error('未找到 LibreOffice，请安装或配置 SOFFICE_PATH');
      }
      return { fileUrl: '' };
    }
  }
}
