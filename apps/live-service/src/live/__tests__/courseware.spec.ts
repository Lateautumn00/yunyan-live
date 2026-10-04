import { describe, expect, it } from 'vitest';
import { createLiveService } from './test-utils';

describe('LiveService.saveVideoRecording', () => {
  it('七个字段入库并返回 success', async () => {
    const { service, video } = createLiveService();
    const res = await service.saveVideoRecording({
      roomId: 'r1',
      filePath: '/r/v1.mp4',
      fileName: 'v1.mp4',
      fileSize: 1024,
      duration: 3600,
      recordType: 1,
      teacherName: '张老师'
    });
    expect(video.repo.create).toHaveBeenCalledWith({
      roomId: 'r1',
      filePath: '/r/v1.mp4',
      fileName: 'v1.mp4',
      fileSize: 1024,
      duration: 3600,
      recordType: 1,
      teacherName: '张老师'
    });
    expect(video.repo.save).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true });
  });
});

describe('LiveService.saveCourseware', () => {
  it('createUserId 缺省回填空串并返回 id', async () => {
    const { service, courseware } = createLiveService();
    courseware.repo.create.mockReturnValueOnce({
      id: 'c9',
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileurl: '/u/a.pptx',
      createUserId: ''
    });
    const res = await service.saveCourseware({
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileurl: '/u/a.pptx'
    });
    expect(courseware.repo.create).toHaveBeenCalledWith({
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileurl: '/u/a.pptx',
      createUserId: ''
    });
    expect(courseware.repo.save).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ id: 'c9' });
  });

  it('显式 createUserId 原样入库', async () => {
    const { service, courseware } = createLiveService();
    await service.saveCourseware({
      roomId: 'r1',
      filename: 'b.pdf',
      filext: 'pdf',
      filesize: 1,
      fileurl: '/u/b.pdf',
      createUserId: 'u1'
    });
    expect(courseware.repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ createUserId: 'u1' })
    );
  });
});

describe('LiveService.listCoursewares', () => {
  it('按创建时间升序返回，createdAt 序列化毫秒字符串', async () => {
    const { service, courseware } = createLiveService();
    const date = new Date(1704067200000);
    courseware.repo.find.mockResolvedValue([
      {
        id: 'c1',
        roomId: 'r1',
        filename: 'a.pptx',
        filext: 'pptx',
        filesize: 123,
        fileurl: '/u/a.pptx',
        createdAt: date
      },
      {
        id: 'c2',
        roomId: 'r1',
        filename: 'b.pdf',
        filext: 'pdf',
        filesize: 1,
        fileurl: '/u/b.pdf',
        createdAt: '2024-01-01T00:00:00.000Z'
      }
    ]);
    const res = await service.listCoursewares('r1');
    expect(courseware.repo.find).toHaveBeenCalledWith({
      where: { roomId: 'r1' },
      order: { createdAt: 'ASC' }
    });
    expect(res.total).toBe(2);
    expect(res.items[0]).toMatchObject({ id: 'c1', createdAt: '1704067200000' });
    expect(res.items[1]).toMatchObject({ id: 'c2', createdAt: '2024-01-01T00:00:00.000Z' });
  });
});

describe('LiveService.deleteCourseware', () => {
  it('空 id 直接抛错', async () => {
    const { service, courseware } = createLiveService();
    await expect(service.deleteCourseware('')).rejects.toThrow('courseware id is required');
    expect(courseware.repo.delete).not.toHaveBeenCalled();
  });

  it('未删到记录（affected=0）抛错，避免静默成功', async () => {
    const { service, courseware } = createLiveService();
    await expect(service.deleteCourseware('c1')).rejects.toThrow(
      'courseware not found or already deleted'
    );
    expect(courseware.repo.delete).toHaveBeenCalledWith('c1');
  });

  it('删除成功返回 success', async () => {
    const { service, courseware } = createLiveService();
    courseware.repo.delete.mockResolvedValueOnce({ affected: 1 });
    await expect(service.deleteCourseware('c1')).resolves.toEqual({ success: true });
  });
});
