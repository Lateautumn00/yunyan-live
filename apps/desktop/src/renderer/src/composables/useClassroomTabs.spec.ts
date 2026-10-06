import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useClassroomTabs } from '@/composables/useClassroomTabs';

function makeTabs(role: 'teacher' | 'student' = 'student') {
  const setIsDotNum = vi.fn();
  const tabs = useClassroomTabs({
    role,
    initialLayoutNum: 2,
    withVideosPane: true,
    video: ref(null),
    dotTop: ref({ setIsDotNum })
  });
  return { tabs, setIsDotNum };
}

describe('useClassroomTabs', () => {
  it('chat-mention 归属聊天页签：聊天激活时早退不累计', () => {
    const { tabs } = makeTabs();
    tabs.updateNum(true, 1, 'chat-mention');
    expect(tabs.chatMentionNum.value).toBe(0);
    tabs.handleClick('people');
    tabs.updateNum(true, 1, 'chat-mention');
    expect(tabs.chatMentionNum.value).toBe(1);
    expect(tabs.chatNum.value).toBe(0);
  });

  it('chat 与 chat-mention 独立累计', () => {
    const { tabs } = makeTabs();
    tabs.handleClick('people');
    tabs.updateNum(true, 1, 'chat');
    tabs.updateNum(true, 1, 'chat-mention');
    tabs.updateNum(true, 1, 'chat-mention');
    expect(tabs.chatNum.value).toBe(1);
    expect(tabs.chatMentionNum.value).toBe(2);
  });

  it('清零 chat 连带清零 chat-mention', () => {
    const { tabs } = makeTabs();
    tabs.handleClick('people');
    tabs.updateNum(true, 1, 'chat');
    tabs.updateNum(true, 1, 'chat-mention');
    tabs.updateNum(false, 0, 'chat');
    expect(tabs.chatNum.value).toBe(0);
    expect(tabs.chatMentionNum.value).toBe(0);
  });

  it('点击聊天页签清零 chat 与 chat-mention', () => {
    const { tabs } = makeTabs();
    tabs.handleClick('people');
    tabs.updateNum(true, 1, 'chat');
    tabs.updateNum(true, 1, 'chat-mention');
    tabs.handleClick('chat');
    expect(tabs.chatNum.value).toBe(0);
    expect(tabs.chatMentionNum.value).toBe(0);
    expect(tabs.activeName.value).toBe('chat');
  });

  it('负向更新仅扣减 chat-mention', () => {
    const { tabs } = makeTabs();
    tabs.handleClick('people');
    tabs.updateNum(true, 2, 'chat-mention');
    tabs.updateNum(false, 1, 'chat-mention');
    expect(tabs.chatMentionNum.value).toBe(1);
    expect(tabs.chatNum.value).toBe(0);
  });

  it('dotTop 在布局为 1 时打点', () => {
    const { tabs, setIsDotNum } = makeTabs();
    tabs.updateNum(true, 1, 'chat');
    expect(setIsDotNum).not.toHaveBeenCalled();
    tabs.setLayouts(1);
    tabs.updateNum(true, 1, 'chat');
    expect(setIsDotNum).toHaveBeenCalledWith(1);
  });

  it('角色徽标映射：teacher=raisehands，student=playback', () => {
    const teacher = makeTabs('teacher');
    teacher.tabs.handleClick('people');
    teacher.tabs.updateNum(true, 1, 'raisehands');
    expect(teacher.tabs.badgeNum.value).toBe(1);

    const student = makeTabs('student');
    student.tabs.handleClick('people');
    student.tabs.updateNum(true, 1, 'playback');
    expect(student.tabs.badgeNum.value).toBe(1);
    student.tabs.updateNum(true, 1, 'raisehands');
    expect(student.tabs.badgeNum.value).toBe(1);
  });
});
