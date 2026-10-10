import { beforeEach, describe, expect, it } from 'vitest';
import {
  addFavorite,
  createMemoryAssetBackend,
  getFavorite,
  listFavorites,
  removeFavorite,
  setAssetBackend
} from './assetStore';

describe('assetStore — F3.3 本地素材收藏', () => {
  beforeEach(() => {
    setAssetBackend(createMemoryAssetBackend());
  });

  it('addFavorite 写入并可 get/list 读回', async () => {
    const a = await addFavorite('cell.png', 'data:image/png;base64,AAA');
    expect(a.id).toBeTruthy();
    expect(a.name).toBe('cell.png');
    const got = await getFavorite(a.id);
    expect(got?.dataUrl).toBe('data:image/png;base64,AAA');
    const list = await listFavorites();
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe('cell.png');
  });

  it('removeFavorite 删除后 list 为空，get 返回 null', async () => {
    const a = await addFavorite('circuit.svg', 'data:image/svg+xml,BBB');
    await removeFavorite(a.id);
    expect(await listFavorites()).toHaveLength(0);
    expect(await getFavorite(a.id)).toBeNull();
  });

  it('多次导入按创建时间倒序（新在前）', async () => {
    await addFavorite('first.png', 'd1');
    await new Promise(r => setTimeout(r, 2));
    await addFavorite('second.png', 'd2');
    const list = await listFavorites();
    expect(list.map(a => a.name)).toEqual(['second.png', 'first.png']);
  });
});
