import { ref, type Ref } from 'vue';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ClassroomWhiteboardOptions {
  video: Ref<any>;
  chat: Ref<any>;
  roomId: string;
  actMode: 'log' | 'assemble';
  actLogText: string;
  actLogData: boolean;
}

/* eslint-enable @typescript-eslint/no-explicit-any */

export function useClassroomWhiteboard(options: ClassroomWhiteboardOptions) {
  const { video, chat, roomId, actMode, actLogText, actLogData } = options;
  const teacherStage = ref<{ [key: string]: unknown } | null>(null);
  const wbdata = ref('');

  function getWhiteBoard(data: Record<string, unknown>) {
    console.log('白板历史信息', data);
    teacherStage.value = data;
  }

  function act(data: string) {
    if (actLogData) {
      console.log(actLogText, data);
    } else {
      console.log(actLogText);
    }
    if (actMode !== 'assemble') return;
    if (data !== '|WBDATAEND|') {
      wbdata.value += data;
    } else {
      console.log('拼接完成数据字符串');
      try {
        teacherStage.value = JSON.parse(wbdata.value);
        wbdata.value = '';
      } catch (_err) {
        console.error('获取白板数据字符串出错', wbdata.value);
        wbdata.value = '';
      }
    }
  }

  function sendWhiteboardNews(data: string) {
    const datastring = JSON.stringify(data);
    const base = 10240;
    const n = Math.ceil(datastring.length / base);
    new Promise<void>((resolve) => {
      const string = datastring;
      for (let i = 0; i < n; i++) {
        const v = string.substring(i * base, (i + 1) * base);
        video.value?.sendData('public', JSON.stringify({ type: 0, data: v }));
      }
      resolve();
    }).then(() => {
      video.value?.sendData('public', JSON.stringify({ type: 0, data: '|WBDATAEND|' }));
    });
    chat.value?.setSocketSend(
      JSON.stringify({
        type: 'whiteBoard',
        data: { liveMsg: { roomId: roomId, msg: data } }
      })
    );
  }

  return { teacherStage, wbdata, getWhiteBoard, act, sendWhiteboardNews };
}
