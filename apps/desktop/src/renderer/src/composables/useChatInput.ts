import { computed, nextTick, ref, type Ref } from 'vue';
import type { MentionInstance, MentionOption } from 'element-plus';
import type { MentionTarget } from '@yunyan-live/types';
import { useRoomStore } from '@/store/room';
import {
  buildMentionOptions,
  insertAtCursor,
  type MentionOption as TargetOption
} from '@/utils/chatFormat';

interface ChatInputOptions {
  sendContent: Ref<string>;
  /** el-mention 实例（模板 ref，由宿主组件声明并注入） */
  mentionRef: Ref<MentionInstance | null>;
  isTeacher: () => boolean;
  /** 当前用户 id（opaqueId）：补全选项排除自身 */
  selfId: () => string;
  /** Enter 且非补全/非组字时的发送回调 */
  onEnterSend: () => void;
}

/** Chat 输入区：@提及补全（含离线快照）+ Unicode 表情插入 + Enter 收敛守卫 */
export function useChatInput(options: ChatInputOptions) {
  const { sendContent, mentionRef, isTeacher, selfId, onEnterSend } = options;
  /** @select 快照：成员离线后仍可完成该次提及的载荷提取 */
  const selectedMentions = ref<MentionTarget[]>([]);
  const roomStore = useRoomStore();

  /** 补全选项：成员 + 教师置顶'所有人' + 已选快照（离线兜底）；排除自身 */
  const mentionTargets = computed<TargetOption[]>(() => {
    const self = selfId();
    const targets = buildMentionOptions(roomStore.members, isTeacher()).filter(
      t => t.userId !== self
    );
    for (const snapshot of selectedMentions.value) {
      if (snapshot.userId === self) continue;
      if (!targets.some(t => t.userId === snapshot.userId)) {
        targets.push({ userId: snapshot.userId, label: snapshot.userName });
      }
    }
    return targets;
  });

  /** el-mention 选项：value 即正文插入文本（@后展示名），携带 userId 供 @select 回传 */
  const mentionOptions = computed<MentionOption[]>(() =>
    mentionTargets.value.map(t => ({ value: t.label, label: t.label, userId: t.userId }))
  );

  function onMentionSelect(option: MentionOption) {
    const userId = option.userId;
    const userName = option.label ?? option.value ?? '';
    if (!userId || !userName || userId === selfId()) return;
    if (!selectedMentions.value.some(m => m.userId === userId)) {
      selectedMentions.value.push({ userId, userName });
    }
  }

  function inputEl(): HTMLInputElement | null {
    const inputInstance = mentionRef.value?.input as { input?: HTMLInputElement } | undefined;
    return inputInstance?.input ?? null;
  }

  function insertEmoji(emoji: string) {
    const el = inputEl();
    const start = el?.selectionStart ?? sendContent.value.length;
    const end = el?.selectionEnd ?? start;
    const { value, caret } = insertAtCursor(sendContent.value, start, end, emoji);
    sendContent.value = value;
    nextTick(() => {
      el?.setSelectionRange(caret, caret);
      el?.focus();
    });
  }

  function onEnter(e: KeyboardEvent) {
    // 补全打开时 EP 的 Enter 处理排在本处理器之后，defaultPrevented 尚未置位，
    // 主守卫用 dropdownVisible；defaultPrevented 仅作顺序变化时的双保险。
    if (e.isComposing || e.defaultPrevented || mentionRef.value?.dropdownVisible) return;
    if (sendContent.value.length) onEnterSend();
  }

  return {
    mentionTargets,
    mentionOptions,
    onMentionSelect,
    insertEmoji,
    onEnter
  };
}
