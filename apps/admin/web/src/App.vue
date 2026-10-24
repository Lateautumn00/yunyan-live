<template>
  <el-config-provider :locale="currentLocale">
    <router-view />
  </el-config-provider>
</template>

<script lang="ts">
import { ElConfigProvider } from 'element-plus';
import { computed, defineComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useGlobal } from '@pureadmin/utils';
import en from 'element-plus/es/locale/lang/en';
import zhCn from 'element-plus/es/locale/lang/zh-cn';

export default defineComponent({
  name: 'App',
  components: {
    [ElConfigProvider.name]: ElConfigProvider
  },
  setup() {
    const route = useRoute();
    const router = useRouter();
    const { $storage } = useGlobal<GlobalPropertiesApi>();
    const currentLocale = computed(() => ($storage.locale?.locale === 'zh' ? zhCn : en));

    // keep route reference for future hooks
    void route;
    void router;

    return {
      currentLocale
    };
  }
});
</script>
