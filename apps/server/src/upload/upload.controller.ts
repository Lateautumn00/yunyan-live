import { Controller, Post, UseInterceptors, UploadedFile, BadRequestException, Logger } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname, join } from 'path';
import { existsSync, mkdirSync, writeFileSync, readdirSync, renameSync } from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  buildPdfToPngArgs,
  buildPptToPdfArgs,
  PDF_TO_PNG_TIMEOUT_MS,
  PDFTOPPM_PREFIX,
  PPT_TO_PDF_TIMEOUT_MS,
  sortPageFiles,
} from './ppt-convert';

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

    const imagesDir = join(pptDir, baseName);
    ensureDir(imagesDir);

    const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
    const fileUrl = `${baseUrl}/uploads/ppt/${baseName}/`;
    let step = 'LibreOffice 转 PDF';

    try {
      const sofficePath =
        process.env.SOFFICE_PATH ||
        (process.platform === 'win32'
          ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe'
          : 'soffice');
      this.logger.log(`使用soffice路径: ${sofficePath}`);

      const pdfArgs = buildPptToPdfArgs(imagesDir, pptPath);
      this.logger.log(`执行: ${sofficePath} ${pdfArgs.join(' ')}`);
      await execFileAsync(sofficePath, pdfArgs, { timeout: PPT_TO_PDF_TIMEOUT_MS });
      this.logger.log(`LibreOffice转换完成`);

      const pdfFiles = readdirSync(imagesDir).filter(f => f.endsWith('.pdf'));
      if (pdfFiles.length === 0) {
        throw new Error('LibreOffice 未生成 PDF 文件');
      }
      const pdfPath = join(imagesDir, pdfFiles[0]!);

      step = 'pdftoppm 转 PNG';
      const pdftoppmPath = process.env.PDFTOPPM_PATH || 'pdftoppm';
      const outputPrefix = join(imagesDir, PDFTOPPM_PREFIX);
      const pngArgs = buildPdfToPngArgs(pdfPath, outputPrefix);
      this.logger.log(`执行: ${pdftoppmPath} ${pngArgs.join(' ')}`);
      await execFileAsync(pdftoppmPath, pngArgs, { timeout: PDF_TO_PNG_TIMEOUT_MS });

      const rawFiles = readdirSync(imagesDir).filter(f => f.endsWith('.png'));
      if (rawFiles.length === 0) {
        throw new Error('pdftoppm 未生成 PNG 文件');
      }
      this.logger.log(`原始文件: ${sortPageFiles(rawFiles).join(', ')}`);

      const ordered = sortPageFiles(rawFiles);
      for (let i = 0; i < ordered.length; i++) {
        const src = join(imagesDir, ordered[i]!);
        const dst = join(imagesDir, `${i + 1}.png`);
        if (src !== dst) {
          renameSync(src, dst);
        }
      }

      const files = readdirSync(imagesDir).filter(f => f.endsWith('.png'));
      const totalNumber = files.length;
      this.logger.log(`PPT转图片完成，共${totalNumber}页`);
      return { totalNumber, fileUrl };
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`PPT转图片失败(${step}): ${msg}`, (err as Error).stack);
      if (msg.includes('ENOENT')) {
        if (step.startsWith('pdftoppm')) {
          this.logger.error('未找到 pdftoppm，请安装 poppler-utils: sudo apt install poppler-utils');
        } else {
          this.logger.error('未找到 LibreOffice，请安装或配置 SOFFICE_PATH');
        }
      }
      return { totalNumber: 0, fileUrl };
    }
  }
}
