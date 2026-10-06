<template>
  <div class="equip-panel">
    <div v-if="active === 0" class="pre-check">
      <h3>准备检测</h3>
      <p>
        为了保证更好的直播效果,请务必完成设备检测~<br />
        同时为了提升声音质量以及避免啸叫噪音,推荐您佩戴使用有线耳机.
      </p>
      <p class="ready-hint">设备网络连接正常,可以开始检测.</p>
      <el-button @click="active = 1"> 开始检测 </el-button>
      <p>自检通过后不会再出现此提醒</p>
    </div>

    <div v-if="active !== 5 && active !== 0" class="check">
      <el-steps :active="active">
        <el-step title="">
          <template #icon>
            <el-icon :size="20" class="equip-icon is-full">
              <VideoCameraFilled />
            </el-icon>
          </template>
        </el-step>
        <el-step title="">
          <template #icon>
            <el-icon :size="20" class="equip-icon" :class="{ 'is-done': active >= 2 }">
              <Headset />
            </el-icon>
          </template>
        </el-step>
        <el-step title="">
          <template #icon>
            <el-icon :size="20" class="equip-icon" :class="{ 'is-done': active >= 3 }">
              <Microphone />
            </el-icon>
          </template>
        </el-step>
        <el-step title="">
          <template #icon>
            <el-icon :size="20" class="equip-icon" :class="{ 'is-done': active >= 4 }">
              <Monitor />
            </el-icon>
          </template>
        </el-step>
      </el-steps>
      <div class="check-line">
        <span class="check-dot">
          <el-icon v-if="videoWork && active > 1" color="#61ba47">
            <CircleCheckFilled />
          </el-icon>
          <el-icon v-else-if="!videoWork && active > 1" color="#E0383E">
            <CircleFilled />
          </el-icon>
        </span>

        <span class="check-dot">
          <el-icon v-if="soundWork && active > 2" color="#61ba47">
            <CircleCheckFilled />
          </el-icon>
          <el-icon v-else-if="!soundWork && active > 2" color="#E0383E">
            <CircleFilled />
          </el-icon>
        </span>

        <span class="check-dot">
          <el-icon v-if="mikeWork && active > 3" color="#61ba47">
            <CircleCheckFilled />
          </el-icon>
          <el-icon v-else-if="!mikeWork && active > 3" color="#E0383E">
            <CircleFilled />
          </el-icon>
        </span>

        <span class="check-dot">
          <el-icon v-if="netWork && active >= 4" color="#61ba47">
            <CircleCheckFilled />
          </el-icon>
          <el-icon v-else-if="!netWork && active > 4" color="#E0383E">
            <CircleFilled />
          </el-icon>
        </span>
      </div>
      <!-- 摄像头 -->
      <div v-if="active === 1" class="camera">
        <div class="camera-select">
          <span>选择摄像头</span>
          <el-select v-model="videoTrack">
            <el-option
              v-for="item in tracks"
              :key="item.id"
              :label="item.label"
              :value="item.label"
            />
          </el-select>
        </div>

        <div class="camera-window">
          <video src="" />
          <el-tooltip class="item" effect="dark" placement="top-end">
            <template #content>
              <div>
                1.若杀毒软件弹出提示，请选择"允许"<br />
                2.检查摄像头设备是否正确连接并开启<br />
                3.检查摄像头设备是否被其他程序占用<br />
                4.尝试重新拔插摄像头或更换插口<br />
                5.尝试重启电脑后再次检测
              </div>
            </template>
            <p>看不见视频?</p>
          </el-tooltip>
        </div>
        <p v-if="videoWork" class="camera-note">通过摄像头是否可以清晰的看到自己?</p>
        <p v-if="redVideo" class="red-camera-note">
          检测到摄像头正常连接,确定无法通过摄像头看到自己吗?
        </p>
        <div class="camera-buttons">
          <el-button :disabled="!cameraTrack" @click="canNotSee()"> 看不到 </el-button>
          <el-button :disabled="!cameraTrack" @click="seeVideo()"> 能看到 </el-button>
        </div>
      </div>

      <!-- 扬声器 -->
      <div v-if="active === 2" class="sound">
        <div class="sound-select">
          <span>选择扬声器</span>
          <el-select v-model="audioTrack">
            <el-option
              v-for="item in tracks"
              :key="item.id"
              :label="item.label"
              :value="item.label"
            />
          </el-select>
        </div>
        <div class="sound-window">
          <div class="sound-click" @click="playAudio">
            <audio :src="audioUrl" />
            <el-icon :size="16">
              <Headset />
            </el-icon>
            点击播放测试音
          </div>
          <input
            id="sound-input"
            class="sound-range"
            name="sound-volume"
            type="range"
            min="0"
            max="100"
          />
          <div class="sound-score">
            <p>输出音量 {{ soundScore }} %</p>
            <el-tooltip class="item" effect="dark" placement="top-end">
              <template #content>
                <div>
                  1.若杀毒软件弹出提示，请选择"允许"<br />
                  2.检查音频设备是否正确连接并开启<br />
                  3.检查音频设备是否被其他程序占用<br />
                  4.尝试重新拔插音频设备或更换插口<br />
                  5.尝试重启电脑后再次检测
                </div>
              </template>
              <p>听不见声音?</p>
            </el-tooltip>
          </div>
        </div>
        <p v-if="soundWork" class="sound-note">通过扬声器是否可以清晰的听到声音?</p>
        <p v-if="redSound" class="red-sound-note">
          检测到扬声器已正常连接，确定无法通过扬声器听到声音吗？
        </p>
        <div class="sound-buttons">
          <el-button @click="canNotHear()"> 听不到 </el-button>
          <el-button @click="hearSound()"> 能听到 </el-button>
        </div>
      </div>

      <!-- 麦克风 -->
      <div v-if="active === 3" class="mike">
        <div class="mike-select">
          <span>选择麦克风</span>
          <el-select v-model="audioTrack">
            <el-option
              v-for="item in tracks"
              :key="item.id"
              :label="item.label"
              :value="item.label"
            />
          </el-select>
        </div>
        <div class="mike-window">
          <p>试试对着麦克风从1数到10,并观察音量跳动</p>
          <canvas id="canvas" width="266" height="20" />
          <input
            id="mike-input"
            class="mike-range"
            name="mike-volume"
            type="range"
            min="0"
            max="100"
          />
          <div class="mike-score">
            <p>输出音量 {{ mikeScore }} %</p>
            <el-tooltip class="item" effect="dark" placement="top-end">
              <template #content>
                <div>
                  1.若杀毒软件弹出提示，请选择"允许"<br />
                  2.检查音频设备是否正确连接并开启<br />
                  3.检查音频设备是否被其他程序占用<br />
                  4.尝试重新拔插音频设备或更换插口<br />
                  5.尝试重启电脑后再次检测
                </div>
              </template>
              <p>听不见声音?</p>
            </el-tooltip>
          </div>
        </div>
        <p v-if="mikeWork" class="mike-note">通过耳机是否可以听到声音并看到音量跳动?</p>
        <p v-if="redMike" class="red-mike-note">
          检测到麦克风已正常连接，确定无法听到声音或看不到音量跳动效果吗？
        </p>
        <div class="mike-buttons">
          <el-button @click="canNotSeeNorHear()"> 听不到 </el-button>
          <el-button @click="hearAndSeeMike()"> 能听到 </el-button>
        </div>
      </div>

      <!-- 网络 -->
      <div v-if="active === 4" class="network">
        <div class="net-window">
          <div>
            <p>操作系统</p>
            <p>{{ platform.name }}</p>
          </div>
          <div>
            <p>客户端版本</p>
            <p>{{ version }}</p>
          </div>
          <div>
            <p>上行</p>
            <p>{{ uplink }}</p>
          </div>
          <div>
            <p>下行</p>
            <p>{{ downlink }}</p>
          </div>
          <div>
            <p />
            <el-tooltip class="item" effect="dark" placement="top-end">
              <template #content>
                <div>
                  1.建议使用网线连接<br />
                  2.网络高峰时段会产生较大网络波动<br />
                  3.尝试切换网络再次检测
                </div>
              </template>
              <p>网络不好?</p>
            </el-tooltip>
          </div>
        </div>
        <p class="net-note">所有检测完成</p>
        <div class="net-buttons">
          <el-button @click="recheckNetwork"> 重新测速 </el-button>
          <el-button @click="viewReport()"> 查看报告 </el-button>
        </div>
      </div>
    </div>

    <!-- 完成检测 -->
    <div v-if="active === 5" class="result">
      <h3>检测结果</h3>
      <div class="result-window">
        <div>
          <p>摄像头</p>
          <p v-if="videoWork" class="success">
            能看见<el-icon color="#61ba47">
              <CircleCheckFilled />
            </el-icon>
          </p>
          <p v-else class="error">
            能看见<el-icon color="#E0383E">
              <CircleFilled />
            </el-icon>
          </p>
        </div>
        <div>
          <p>扬声器/听筒</p>
          <p v-if="soundWork" class="success">
            能看见<el-icon color="#61ba47">
              <CircleCheckFilled />
            </el-icon>
          </p>
          <p v-else class="error">
            能看见<el-icon color="#E0383E">
              <CircleFilled />
            </el-icon>
          </p>
        </div>
        <div>
          <p>麦克风</p>
          <p v-if="mikeWork" class="success">
            能听到和看到<el-icon color="#61ba47">
              <CircleCheckFilled />
            </el-icon>
          </p>
          <p v-else class="error">
            能听到和看到<el-icon color="#E0383E">
              <CircleFilled />
            </el-icon>
          </p>
        </div>
        <div>
          <p>网络</p>
          <p v-if="netWork" class="success">
            1Mb/S<el-icon color="#61ba47">
              <CircleCheckFilled />
            </el-icon>
          </p>
          <p v-else class="error">
            1Mb/S<el-icon color="#E0383E">
              <CircleFilled />
            </el-icon>
          </p>
        </div>
      </div>
      <el-icon
        v-if="videoWork && soundWork && mikeWork && netWork"
        :size="59"
        color="#61ba47"
        class="result-face"
      >
        <Sunny />
      </el-icon>
      <el-icon v-else :size="59" color="#e0383e" class="result-face">
        <Failed />
      </el-icon>
      <p v-if="videoWork && soundWork && mikeWork && netWork" class="result-note">
        恭喜所有检测达标,可以进入直播
      </p>
      <p v-else class="result-note">检测未达标,请检查设备稍后再试</p>

      <div class="result-buttons">
        <el-button @click="recheckAll()"> 重新检测 </el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import { config } from '@/api';
import testToneUrl from '@/assets/audio/test-tone.wav';

const audioUrl: string = testToneUrl;
const version: string = config.version;
const videoTrack = ref<string>('');
const audioTrack = ref<string>('');
const tracks = ref<MediaStreamTrack[]>([]);
const videoCtx = ref<HTMLVideoElement | null>(null);
const audioCtx = new AudioContext();
const videoWork = ref<boolean>(false);
const redVideo = ref<boolean>(false);
const cameraTrack = ref<boolean>(false);
const soundWork = ref<boolean>(false);
const redSound = ref<boolean>(false);
const mikeWork = ref<boolean>(false);
const redMike = ref<boolean>(false);
const netWork = ref<boolean>(false);
const active = ref<number>(0);
const soundScore = ref<number>(50);
const mikeScore = ref<number>(50);
const platform = ref<{ name: string }>({
  name: (navigator.userAgent.split('(')[1] ?? '').split(')')[0] ?? ''
});
const uplink = ref<string | null>(null);
const downlink = ref<string | null>(null);
const drawVisual = ref<number | null>(null);
const lastSoundVolume = ref<string | null>(null);
const cameraStream = ref<MediaStream | null>(null);
const audioStream = ref<MediaStream | null>(null);
const mikeStream = ref<MediaStream | null>(null);

function stopAllDevices() {
  cancelAnimation();
  cameraStream.value?.getTracks().forEach(t => t.stop());
  cameraStream.value = null;
  audioStream.value?.getTracks().forEach(t => t.stop());
  audioStream.value = null;
  mikeStream.value?.getTracks().forEach(t => t.stop());
  mikeStream.value = null;
  soundListenerAdded = false;
  const videoEl = document.querySelector('video');
  if (videoEl) videoEl.srcObject = null;
  void audioCtx.close();
}

function stopStep(step: number) {
  if (step === 1) {
    cancelAnimation();
    cameraStream.value?.getTracks().forEach(t => t.stop());
    cameraStream.value = null;
    const videoEl = document.querySelector('video');
    if (videoEl) videoEl.srcObject = null;
  } else if (step === 2) {
    audioStream.value?.getTracks().forEach(t => t.stop());
    audioStream.value = null;
    soundListenerAdded = false;
  } else if (step === 3) {
    cancelAnimation();
    mikeStream.value?.getTracks().forEach(t => t.stop());
    mikeStream.value = null;
  }
}

onUnmounted(() => {
  stopAllDevices();
});

watch(active, (val: number, oldVal?: number) => {
  if (oldVal !== undefined) stopStep(oldVal);

  if (val === 1) {
    navigator.mediaDevices
      .getUserMedia({ video: { width: 256, height: 144 } })
      .then(stream => {
        cameraStream.value = stream;
        tracks.value = stream.getTracks();
        if (tracks.value.length > 0) {
          videoTrack.value = tracks.value[0]?.label ?? '';
          const videoEl = document.querySelector('video');
          videoCtx.value = videoEl;
          if (videoEl) {
            videoEl.srcObject = stream;
            videoEl.onloadedmetadata = () => {
              void videoEl.play();
            };
          }
          cameraTrack.value = true;
          videoWork.value = true;
        } else {
          videoWork.value = false;
        }
      })
      .catch((err: DOMException) => {
        console.log(err.name + ': ' + err.message);
        cameraTrack.value = true;
      });
  } else if (val === 2) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(stream => {
        audioStream.value = stream;
        tracks.value = stream.getTracks();
        if (tracks.value.length > 0) {
          styleInputRange('sound-input');
          const volumeInputSoundNode = document.getElementById('sound-input') as HTMLInputElement;
          volumeInputSoundNode.value = soundScore.value as unknown as string;

          volumeInputSoundNode.oninput = e => {
            styleInputRange('sound-input');
            soundScore.value = Number((e.target as HTMLInputElement).value);
            lastSoundVolume.value = (e.target as HTMLInputElement).value;
          };

          audioTrack.value = tracks.value[0]?.label ?? '';
          soundWork.value = true;
        }
      })
      .catch((err: DOMException) => {
        console.log(err.name + ': ' + err.message);
      });
  } else if (val === 3) {
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(stream => {
        mikeStream.value = stream;
        const analyser = audioCtx.createAnalyser();
        analyser.minDecibels = -90;
        analyser.maxDecibels = -10;
        analyser.smoothingTimeConstant = 0.85;

        const gainNode = audioCtx.createGain();
        const audioSourceNode = audioCtx.createMediaStreamSource(stream);

        const biquadFilter = audioCtx.createBiquadFilter();
        biquadFilter.type = 'lowshelf';
        biquadFilter.frequency.setTargetAtTime(1000, audioCtx.currentTime, 0);

        styleInputRange('mike-input');
        const volumeInputMikeNode = document.getElementById('mike-input') as HTMLInputElement;
        volumeInputMikeNode.value = mikeScore.value as unknown as string;

        const gainConnection = () => {
          biquadFilter.gain.setTargetAtTime(gainNode.gain.value, audioCtx.currentTime, 0);
          gainNode.connect(analyser);
          audioSourceNode.connect(gainNode);
          audioSourceNode.connect(biquadFilter);
          biquadFilter.connect(audioCtx.destination);
          analyser.connect(audioCtx.destination);
        };

        const applyMikeVolume = () => {
          styleInputRange('mike-input');
          mikeScore.value = Number(volumeInputMikeNode.value);
          if (mikeScore.value == 0) {
            gainNode.gain.value = -1;
            gainConnection();
          } else {
            gainNode.gain.value = mikeScore.value / 100;
            gainConnection();
          }
        };

        volumeInputMikeNode.onchange = applyMikeVolume;
        volumeInputMikeNode.oninput = applyMikeVolume;
        gainConnection();

        analyser.fftSize = 256;
        const bufferLengthAlt = analyser.frequencyBinCount;
        const dataArrayAlt = new Uint8Array(bufferLengthAlt);

        const canvas = document.getElementById('canvas') as HTMLCanvasElement;
        const canvasCtx = canvas.getContext('2d')!;
        const WIDTH = canvas.width;
        const HEIGHT = canvas.height;
        const activeColor = '#61BA47';
        const inactiveColor = '#EFEFF4';

        const draw = () => {
          drawVisual.value = requestAnimationFrame(draw);
          analyser.getByteTimeDomainData(dataArrayAlt);

          let maxValue = dataArrayAlt[0] ?? 0;
          for (let i = 1; i <= 128; i++) {
            const sample = dataArrayAlt[i] ?? 0;
            if (sample > maxValue) {
              maxValue = sample;
            }
          }

          const barWidth = (WIDTH / bufferLengthAlt) * 2.5 * 2;
          const barLocation = Math.round(((maxValue - 100) / 20) * (mikeScore.value / 10)) - 2;
          let x = 0;
          const y = 0;

          for (let i = 0; i < 20; i++) {
            canvasCtx.fillStyle = inactiveColor;
            canvasCtx.fillRect(x, y, barWidth, HEIGHT);
            x += 14;
          }
          x = 0;
          for (let i = 1; i <= 128; i++) {
            if (i < barLocation) {
              canvasCtx.fillStyle = activeColor;
            } else {
              canvasCtx.fillStyle = inactiveColor;
            }
            canvasCtx.fillRect(x, y, barWidth, HEIGHT);
            x += 14;
          }
        };

        draw();

        mikeWork.value = true;
      })
      .catch((err: DOMException) => {
        console.log(err.name + ': ' + err.message);
      });
  } else if (val === 4) {
    cancelAnimation();
    const connection = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
    downlink.value = `${connection ? connection.downlink : ''}Kb/S`;
    uplink.value = '2Mb/S';

    if (downlink.value && uplink.value) {
      netWork.value = true;
    } else {
      netWork.value = false;
    }
  }
});

function cancelAnimation() {
  if (drawVisual.value !== null) {
    cancelAnimationFrame(drawVisual.value);
  }
}

let soundListenerAdded = false;

function playAudio() {
  const audioNode = document.querySelector('audio') as HTMLAudioElement;
  if (!audioNode) return;

  const volumeInputNode = document.querySelector('input.sound-range') as HTMLInputElement;

  audioNode.volume = soundScore.value / 100;

  if (!soundListenerAdded && volumeInputNode) {
    soundListenerAdded = true;
    volumeInputNode.addEventListener('input', () => {
      styleInputRange('sound-input');
      soundScore.value = Number(volumeInputNode.value);
      audioNode.volume = soundScore.value / 100;
    });
  }

  audioNode.play().catch((err: unknown) => {
    console.error('播放测试音失败:', err);
  });
}

function styleInputRange(id: string) {
  const slider = document.getElementById(id) as HTMLInputElement;
  const min: number = Number(slider.min);
  const max: number = Number(slider.max);

  let value: number;
  if (id === 'mike-input' && slider.value === lastSoundVolume.value) {
    value = 50;
  } else {
    value = Number(slider.value);
  }

  slider.style.background = `
      linear-gradient(
        to right,
        #096CFF 0%,
        #096CFF ${((value - min) / (max - min)) * 100}%,
        #EFEFF4 ${((value - min) / (max - min)) * 100}%,
        #EFEFF4 100%)
      `;
}

function recheckNetwork() {
  downlink.value = '';
  uplink.value = '';
  netWork.value = false;

  const connection = (navigator as Navigator & { connection?: { downlink?: number } }).connection;
  downlink.value = `${connection ? connection.downlink : ''}Kb/S`;
  uplink.value = '2Mb/S';
  netWork.value = true;
}

function canNotSee() {
  if (active.value === 1 && videoWork.value === true) {
    videoWork.value = false;
    redVideo.value = true;
  } else if (videoWork.value === false) {
    active.value = 2;
  }
}

function canNotHear() {
  if (active.value === 2 && soundWork.value === true) {
    soundWork.value = false;
    redSound.value = true;
  } else if (soundWork.value === false) {
    active.value = 3;
  }
}

function canNotSeeNorHear() {
  if (active.value === 3 && mikeWork.value === true) {
    mikeWork.value = false;
    redMike.value = true;
  } else if (mikeWork.value === false) {
    active.value = 4;
  }
}

function seeVideo() {
  active.value = 2;
  videoWork.value = true;
}

function hearSound() {
  active.value = 3;
  soundWork.value = true;
}

function hearAndSeeMike() {
  active.value = 4;
  mikeWork.value = true;
}

function viewReport() {
  active.value = 5;
  netWork.value = true;
}

function recheckAll() {
  active.value = 1;
  videoWork.value = false;
  redVideo.value = false;
  cameraTrack.value = false;
  soundWork.value = false;
  redSound.value = false;
  mikeWork.value = false;
  redMike.value = false;
  netWork.value = false;
  lastSoundVolume.value = null;
  soundScore.value = 50;
  mikeScore.value = 50;
}
</script>

<style lang="less" scoped>
.equip-icon {
  color: #343434;
  opacity: 0.25;

  &.is-done {
    opacity: 0.88;
  }

  &.is-full {
    opacity: 1;
  }
}
.equip-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
}

.pre-check {
  width: 100%;
  h3 {
    margin-top: 0;
    font-size: 22px;
    color: #333333;
  }
  .ready-hint {
    margin-top: 50px;
    margin-bottom: 6px;
  }
  p:last-of-type {
    color: #919193;
  }
}

.check .el-steps.el-steps--horizontal {
  width: 160px;

  .el-step__icon.is-text {
    border: none;
  }
  .el-step__head.is-finish {
    border-color: #343434;
  }
}
.check .check-line {
  margin-top: 3px;
  width: 160px;
  display: flex;
}
.check-dot {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 18px;
}
.camera,
.sound,
.mike,
.network {
  margin-top: 26px;
}
.camera {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 26px;

  .camera-select {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .camera-window {
    margin-top: 4px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    > video {
      width: 256px;
      height: 144px;
      background: #d8d8d8;
    }
    > p {
      margin-top: 0;
      margin-left: 185px;
      color: #919193;
      font-size: 12px;
    }
  }
  p.camera-note {
    color: #333333;
  }
  .red-camera-note {
    color: #e0383e;
  }
  .camera-buttons {
    display: flex;
    justify-content: space-evenly;
  }
}
.sound {
  display: flex;
  flex-direction: column;
  align-items: center;
  .sound-window {
    width: 256px;
    .sound-click {
      display: flex;
      align-items: center;
      margin-top: 22px;
      width: 256px;
      height: 40px;
      background: #61ba47;
      border-radius: 0px 6px 6px 6px;
      color: #333333;
      cursor: pointer;
      .el-icon {
        margin-left: 15px;
        margin-right: 5px;
      }
    }
    .sound-range {
      margin-top: 20px;
      border-radius: 8px;
      height: 4px;
      width: 256px;
      outline: none;
      -webkit-appearance: none;
    }

    input.sound-range[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      background: #ffffff;
      box-shadow: 0px 0px 2px 0px rgba(0, 0, 0, 0.2);
    }
    .sound-score {
      margin-top: 24px;
      display: flex;
      justify-content: space-between;

      p {
        color: #919193;
        font-size: 12px;
      }
    }
  }
  .sound-note {
    color: #333333;
  }
  .red-sound-note {
    color: #e0383e;
  }
  .sound-buttons {
    display: flex;
    justify-content: space-evenly;
  }
}
.mike {
  display: flex;
  flex-direction: column;
  align-items: center;
  .mike-window {
    width: 266px;
    canvas {
      background: #fff;
    }

    .mike-range {
      margin-top: 20px;
      border-radius: 8px;
      height: 4px;
      width: 260px;
      outline: none;
      -webkit-appearance: none;
    }

    input.mike-range[type='range']::-webkit-slider-thumb {
      -webkit-appearance: none;
      border-radius: 50%;
      width: 20px;
      height: 20px;
      background: #ffffff;
      box-shadow: 0px 0px 2px 0px rgba(0, 0, 0, 0.2);
    }

    .mike-score {
      margin-top: 24px;
      display: flex;
      justify-content: space-between;
      p {
        color: #919193;
        font-size: 12px;
      }
    }
  }
  .mike-note {
    color: #333333;
  }
  .red-mike-note {
    color: #e0383e;
  }
  .mike-buttons {
    display: flex;
    justify-content: space-evenly;
  }
}
.network {
  display: flex;
  flex-direction: column;
  align-items: center;
  .net-window {
    width: 256px;
    display: flex;
    flex-direction: column;

    > div {
      display: flex;
      justify-content: space-between;
      > p {
        margin-top: 5px;
        margin-bottom: 5px;
      }
      > p:first-of-type {
        color: #919193;
      }
      > p:last-of-type {
        color: #333333;
      }
    }
    > div:last-of-type {
      p {
        color: #919193;
        font-size: 12px;
      }
    }
  }
  .net-note {
    color: #333333;
  }
  .net-buttons {
    display: flex;
    justify-content: space-evenly;
  }
}
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  h3 {
    font-size: 22px;
    font-weight: bold;
    color: #333333;
    line-height: 33px;
  }
  .result-window {
    width: 256px;
    display: flex;
    flex-direction: column;

    > div {
      display: flex;
      justify-content: space-between;
      > p {
        margin-top: 5px;
        margin-bottom: 5px;
      }
      > p:first-of-type {
        color: #919193;
      }

      p.success {
        color: #61ba47;
      }
      p.error {
        color: #e0383e;
      }
    }
  }
  .result-note {
    color: #333333;
  }
  .result-buttons {
    display: flex;
    justify-content: space-evenly;
  }
}
video {
  border-radius: 6px;
}

.camera-select,
.sound-select,
.mike-select {
  .el-select {
    width: 180px;

    .el-select__wrapper {
      width: 180px;
      border-radius: 6px;
      background: #efeff4;
      border: none;
      box-shadow: none;
    }
  }
}

.mike-buttons {
  .el-button.el-button--default {
    width: 140px;
  }
}
.camera-buttons,
.mike-buttons,
.sound-buttons,
.net-buttons,
.result-buttons {
  .el-button.el-button--default:first-of-type {
    border: 2px solid #0f74ff;
    background: #fff;
    span {
      color: #0f74ff;
    }
  }
}

.pre-check {
  .el-button.el-button--default {
    margin-top: 6px;
    width: 296px;
    height: 56px;
    background: #0f74ff;
    border-radius: 28px;
  }
}

.camera-buttons {
  .el-button.el-button--default.is-disabled:last-of-type:hover {
    background-color: #0f74ff;
  }
}
</style>
