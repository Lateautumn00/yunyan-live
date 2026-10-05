import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ChangeStatusDto,
  CreateCoursewareDto,
  CreateLiveDto,
  JoinLiveDto,
  UpdateForbidDto,
  UpdateLiveDto
} from '../live.dto';
import { IsAfterNow } from '../validators/is-after-now';

const NOW = new Date('2030-06-01T00:00:00Z').getTime();
const PAST = String(NOW - 60_000);
const FUTURE = String(NOW + 60_000);

class DemoDto {
  @IsAfterNow()
  startTime!: string;
}

function errorsOf<T extends object>(cls: new () => T, input: Record<string, unknown>) {
  return validate(plainToInstance(cls, input));
}

function constraintsOf(errors: ValidationError[], property: string) {
  return errors.find((e) => e.property === property)?.constraints;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('IsAfterNow', () => {
  it('空值放行（由其余必填校验兜底）', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(DemoDto, { startTime: '' });
    expect(constraintsOf(errors, 'startTime')).toBeUndefined();
    const missing = await errorsOf(DemoDto, {});
    expect(constraintsOf(missing, 'startTime')).toBeUndefined();
  });

  it('晚于当前时间放行，早于当前时间拒绝', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    await expect(errorsOf(DemoDto, { startTime: FUTURE })).resolves.toEqual([]);
    const errors = await errorsOf(DemoDto, { startTime: PAST });
    expect(constraintsOf(errors, 'startTime')).toEqual({
      IsAfterNow: '开始时间不能早于当前时间'
    });
  });

  it('非数字时间同样拒绝', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(DemoDto, { startTime: 'not-a-ts' });
    expect(constraintsOf(errors, 'startTime')).toEqual({
      IsAfterNow: '开始时间不能早于当前时间'
    });
  });
});

describe('CreateLiveDto', () => {
  it('合法载荷通过全部校验', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(CreateLiveDto, {
      title: '第一课',
      type: 1,
      startTime: FUTURE,
      duration: 90,
      roomId: 'r1'
    });
    expect(errors).toEqual([]);
  });

  it('缺省可选字段 type/duration/roomId 亦通过', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(CreateLiveDto, { title: '第一课', startTime: FUTURE });
    expect(errors).toEqual([]);
  });

  it('title 必填且 1-200 字符', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    expect(
      constraintsOf(await errorsOf(CreateLiveDto, { startTime: FUTURE }), 'title')
    ).toMatchObject({ isNotEmpty: expect.any(String), minLength: expect.any(String) });
    expect(
      constraintsOf(
        await errorsOf(CreateLiveDto, { title: 'x'.repeat(201), startTime: FUTURE }),
        'title'
      )
    ).toMatchObject({ maxLength: expect.any(String) });
    expect(
      constraintsOf(await errorsOf(CreateLiveDto, { title: 42, startTime: FUTURE }), 'title')
    ).toMatchObject({ isString: expect.any(String) });
  });

  it('startTime 过去时间报中文文案', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(CreateLiveDto, { title: '第一课', startTime: PAST });
    expect(constraintsOf(errors, 'startTime')).toEqual({
      IsAfterNow: '开始时间不能早于当前时间'
    });
  });

  it('startTime 缺失报 isNotEmpty 且不触发 IsAfterNow', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(CreateLiveDto, { title: '第一课' });
    expect(constraintsOf(errors, 'startTime')).toEqual({
      isNotEmpty: expect.any(String),
      isString: expect.any(String)
    });
  });

  it('type 非数字拒绝', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(NOW);
    const errors = await errorsOf(CreateLiveDto, {
      title: '第一课',
      startTime: FUTURE,
      type: 'live'
    });
    expect(constraintsOf(errors, 'type')).toMatchObject({ isNumber: expect.any(String) });
  });
});

describe('JoinLiveDto / ChangeStatusDto', () => {
  it('joinCode 必填，nickName 可缺省', async () => {
    expect(await errorsOf(JoinLiveDto, { joinCode: 'SA1' })).toEqual([]);
    expect(constraintsOf(await errorsOf(JoinLiveDto, {}), 'joinCode')).toMatchObject({
      isNotEmpty: expect.any(String)
    });
  });

  it('status 必须是数字', async () => {
    expect(await errorsOf(ChangeStatusDto, { roomId: 'r1', status: 2 })).toEqual([]);
    expect(
      constraintsOf(await errorsOf(ChangeStatusDto, { roomId: 'r1', status: '2' }), 'status')
    ).toMatchObject({ isNumber: expect.any(String) });
    expect(
      constraintsOf(await errorsOf(ChangeStatusDto, { roomId: '' }), 'roomId')
    ).toMatchObject({ isNotEmpty: expect.any(String) });
  });
});

describe('UpdateForbidDto', () => {
  it('status 仅接受 0 与 1', async () => {
    expect(await errorsOf(UpdateForbidDto, { roomId: 'r1', status: 0 })).toEqual([]);
    expect(await errorsOf(UpdateForbidDto, { roomId: 'r1', status: 1 })).toEqual([]);
    expect(
      constraintsOf(await errorsOf(UpdateForbidDto, { roomId: 'r1', status: 2 }), 'status')
    ).toMatchObject({ isIn: expect.any(String) });
  });

  it('liveUserId 可缺省，roomId 必填', async () => {
    expect(await errorsOf(UpdateForbidDto, { roomId: 'r1', status: 1 })).toEqual([]);
    expect(constraintsOf(await errorsOf(UpdateForbidDto, { status: 1 }), 'roomId')).toMatchObject(
      { isNotEmpty: expect.any(String) }
    );
  });
});

describe('UpdateLiveDto', () => {
  it('仅 roomId 必填，其余可缺省', async () => {
    expect(await errorsOf(UpdateLiveDto, { roomId: 'r1' })).toEqual([]);
  });

  it('title 给值时必须 1-200 字符（无 IsNotEmpty，靠 MinLength 兜底空串）', async () => {
    expect(constraintsOf(await errorsOf(UpdateLiveDto, { roomId: 'r1', title: '' }), 'title'))
      .toEqual({ minLength: expect.any(String) });
    expect(
      constraintsOf(
        await errorsOf(UpdateLiveDto, { roomId: 'r1', title: 'x'.repeat(201) }),
        'title'
      )
    ).toMatchObject({ maxLength: expect.any(String) });
    expect(await errorsOf(UpdateLiveDto, { roomId: 'r1', title: '改名' })).toEqual([]);
  });

  it('roomId 缺失拒绝', async () => {
    expect(constraintsOf(await errorsOf(UpdateLiveDto, {}), 'roomId')).toMatchObject({
      isNotEmpty: expect.any(String)
    });
  });
});

describe('CreateCoursewareDto', () => {
  it('合法载荷通过', async () => {
    const errors = await errorsOf(CreateCoursewareDto, {
      roomId: 'r1',
      filename: 'a.pptx',
      filext: 'pptx',
      filesize: 123,
      fileUrl: '/u/a.pptx'
    });
    expect(errors).toEqual([]);
  });

  it('filename/fileUrl 必填且 filename≤255、filext≤20', async () => {
    expect(
      constraintsOf(await errorsOf(CreateCoursewareDto, { roomId: 'r1', fileUrl: '/u/a' }), 'filename')
    ).toMatchObject({ isNotEmpty: expect.any(String) });
    expect(
      constraintsOf(
        await errorsOf(CreateCoursewareDto, {
          roomId: 'r1',
          filename: 'x'.repeat(256),
          fileUrl: '/u/a'
        }),
        'filename'
      )
    ).toMatchObject({ maxLength: expect.any(String) });
    expect(
      constraintsOf(
        await errorsOf(CreateCoursewareDto, {
          roomId: 'r1',
          filename: 'a.pptx',
          filext: 'x'.repeat(21),
          fileUrl: '/u/a'
        }),
        'filext'
      )
    ).toMatchObject({ maxLength: expect.any(String) });
    expect(
      constraintsOf(await errorsOf(CreateCoursewareDto, { roomId: 'r1', filename: 'a.pptx' }), 'fileUrl')
    ).toMatchObject({ isNotEmpty: expect.any(String) });
    expect(
      constraintsOf(
        await errorsOf(CreateCoursewareDto, { filename: 'a.pptx', fileUrl: '/u/a' }),
        'roomId'
      )
    ).toMatchObject({ isNotEmpty: expect.any(String) });
  });
});
