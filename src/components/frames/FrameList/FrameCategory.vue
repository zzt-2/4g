<template>
  <div class="flex flex-col h-full overflow-hidden bg-[#0f1a2a] text-[#e2e8f0]">
    <div class="flex justify-between items-center px-4 py-3 bg-[#12233f] border-b border-[#1a3663]">
      <div class="flex items-center text-sm font-medium">
        <q-icon name="category" size="20px" class="mr-2 text-[#64748b]" />
        帧分类
      </div>
      <q-btn
        flat
        round
        dense
        icon="add"
        size="sm"
        class="text-[#93c5fd]"
        @click="showAddCategoryDialog = true"
      >
        <q-tooltip>添加分类</q-tooltip>
      </q-btn>
    </div>

    <q-list class="flex-1 overflow-y-auto" padding>
      <q-item
        v-for="category in categories"
        :key="category.id"
        clickable
        :active="selectedCategoryId === category.id"
        @click="selectCategory(category.id)"
        active-class="bg-[#1e3a6a]"
        class="text-[#e2e8f0] hover:bg-[#1a3663] transition-colors duration-200"
      >
        <q-item-section avatar>
          <q-icon :name="category.icon || 'folder'" :color="category.color || 'grey'" />
        </q-item-section>

        <q-item-section>
          <q-item-label class="text-sm">{{ category.name }}</q-item-label>
          <q-item-label caption class="text-[#94a3b8] text-xs">
            {{ category.count }}个帧
          </q-item-label>
        </q-item-section>

        <q-item-section side v-if="category.id !== 'all'">
          <q-btn flat round dense icon="more_vert" size="sm" class="text-[#94a3b8]" @click.stop>
            <q-menu>
              <q-list class="min-w-[120px] bg-[#12233f] text-[#e2e8f0]">
                <q-item
                  clickable
                  v-close-popup
                  @click="editCategory(category.id)"
                  class="hover:bg-[#1a3663]"
                >
                  <q-item-section avatar>
                    <q-icon name="edit" size="xs" class="text-[#93c5fd]" />
                  </q-item-section>
                  <q-item-section>编辑</q-item-section>
                </q-item>
                <q-item
                  clickable
                  v-close-popup
                  @click="confirmDeleteCategory(category.id)"
                  class="hover:bg-[#1a3663]"
                >
                  <q-item-section avatar>
                    <q-icon name="delete" size="xs" color="negative" />
                  </q-item-section>
                  <q-item-section>删除</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </q-item-section>
      </q-item>
    </q-list>

    <!-- 添加分类对话框 -->
    <q-dialog v-model="showAddCategoryDialog" persistent>
      <q-card class="w-100 bg-[#12233f] text-[#e2e8f0]" dark>
        <q-card-section class="row items-center">
          <div class="text-h6">{{ editingCategoryId ? '编辑分类' : '添加分类' }}</div>
          <q-space />
          <q-btn
            icon="close"
            flat
            round
            dense
            v-close-popup
            class="text-[#94a3b8] hover:text-[#e2e8f0]"
          />
        </q-card-section>

        <q-card-section>
          <q-input
            v-model="categoryForm.name"
            label="分类名称"
            outlined
            dense
            dark
            class="bg-[#0a1929]"
          />

          <div class="row q-col-gutter-sm mt-4">
            <div class="col-6">
              <q-select
                v-model="categoryForm.icon"
                :options="iconOptions"
                label="图标"
                outlined
                dense
                dark
                emit-value
                map-options
                class="bg-[#0a1929]"
              >
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <q-icon :name="scope.opt.value" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>

                <template v-slot:selected>
                  <q-icon :name="categoryForm.icon" class="mr-2" />
                  {{ getIconLabel(categoryForm.icon) }}
                </template>
              </q-select>
            </div>

            <div class="col-6">
              <q-select
                v-model="categoryForm.color"
                :options="colorOptions"
                label="颜色"
                outlined
                dense
                dark
                emit-value
                map-options
                class="bg-[#0a1929]"
              >
                <template v-slot:option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <div
                        class="w-4.5 h-4.5 rounded"
                        :style="`background-color: ${scope.opt.value}`"
                      ></div>
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>

                <template v-slot:selected>
                  <div
                    class="w-4.5 h-4.5 rounded mr-2"
                    :style="`background-color: ${categoryForm.color}`"
                  ></div>
                  {{ getColorLabel(categoryForm.color) }}
                </template>
              </q-select>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="bg-[#0f1a2a] py-2 px-4">
          <q-btn flat label="取消" color="grey" v-close-popup class="hover:bg-[#1a3663]" />
          <q-btn
            flat
            label="保存"
            color="primary"
            @click="saveCategory"
            class="hover:bg-[#1e3a6a]"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useQuasar } from 'quasar';
import type { Category } from '../../../types/frames/index';
import { CATEGORY_IDS, SYSTEM_CATEGORIES } from '../../../config/frameDefaults';
// 先移除composable引用，暂时不使用
// import { useFrameCategories } from '../../../composables/frames/useFrameCategories';

// 暂时不使用composable
// const frameCategories = useFrameCategories();

interface CategoryForm {
  name: string;
  icon: string;
  color: string;
}

interface IconOption {
  label: string;
  value: string;
}

interface ColorOption {
  label: string;
  value: string;
}

const props = defineProps<{
  categories: Category[];
}>();

const emit = defineEmits<{
  select: [categoryId: string];
  add: [category: Omit<Category, 'count'>];
  update: [category: Omit<Category, 'count'>];
  delete: [categoryId: string];
}>();

const $q = useQuasar();

// 选中的分类ID
const selectedCategoryId = ref<string>(CATEGORY_IDS.ALL);

// 是否显示添加分类对话框
const showAddCategoryDialog = ref(false);

// 正在编辑的分类ID
const editingCategoryId = ref<string | null>(null);

// 分类表单
const categoryForm = reactive<CategoryForm>({
  name: '',
  icon: 'folder',
  color: 'grey',
});

// 图标选项
const iconOptions: IconOption[] = [
  { label: '文件夹', value: 'folder' },
  { label: '传感器', value: 'sensors' },
  { label: '控制器', value: 'tune' },
  { label: '报警', value: 'notifications' },
  { label: '设备', value: 'devices' },
  { label: '灯光', value: 'lightbulb' },
  { label: '电机', value: 'settings_input_component' },
  { label: '温度', value: 'thermostat' },
  { label: '计时器', value: 'timer' },
  { label: '数据', value: 'storage' },
];

// 颜色选项
const colorOptions: ColorOption[] = [
  { label: '灰色', value: 'grey' },
  { label: '蓝色', value: 'blue' },
  { label: '绿色', value: 'green' },
  { label: '红色', value: 'red' },
  { label: '橙色', value: 'orange' },
  { label: '紫色', value: 'purple' },
  { label: '青色', value: 'teal' },
  { label: '粉色', value: 'pink' },
  { label: '棕色', value: 'brown' },
  { label: '靛蓝', value: 'indigo' },
];

// 选择分类
const selectCategory = (id: string) => {
  selectedCategoryId.value = id;
  emit('select', id);
  // 如果使用frameCategories，也可以调用相应方法
  // frameCategories.selectCategory(id);
};

// 获取图标标签
const getIconLabel = (value: string): string => {
  const option = iconOptions.find((opt) => opt.value === value);
  return option ? option.label : value;
};

// 获取颜色标签
const getColorLabel = (value: string): string => {
  const option = colorOptions.find((opt) => opt.value === value);
  return option ? option.label : value;
};

// 检查是否是系统分类（不允许编辑和删除）
const isSystemCategory = (id: string): boolean => {
  return SYSTEM_CATEGORIES.includes(id as (typeof CATEGORY_IDS)[keyof typeof CATEGORY_IDS]);
};

// 编辑分类
const editCategory = (id: string) => {
  // 系统分类不允许编辑
  if (isSystemCategory(id)) {
    $q.notify({
      color: 'warning',
      message: '系统预设分类不能编辑',
      icon: 'warning',
    });
    return;
  }

  const category = props.categories.find((cat) => cat.id === id);
  if (category) {
    editingCategoryId.value = id;
    categoryForm.name = category.name;
    categoryForm.icon = category.icon || 'folder';
    categoryForm.color = category.color || 'grey';
    showAddCategoryDialog.value = true;
  }
};

// 确认删除分类
const confirmDeleteCategory = (id: string) => {
  // 系统分类不允许删除
  if (isSystemCategory(id)) {
    $q.notify({
      color: 'warning',
      message: '系统预设分类不能删除',
      icon: 'warning',
    });
    return;
  }

  $q.dialog({
    title: '确认删除',
    message: '确定要删除这个分类吗？此操作不会删除分类中的帧。',
    cancel: true,
    persistent: true,
    dark: true,
    class: 'bg-[#12233f]',
  }).onOk(() => {
    emit('delete', id);
    if (selectedCategoryId.value === id) {
      selectCategory(CATEGORY_IDS.ALL);
    }
  });
};

// 保存分类
const saveCategory = () => {
  if (!categoryForm.name.trim()) {
    $q.notify({
      color: 'negative',
      message: '请输入分类名称',
      icon: 'warning',
    });
    return;
  }

  if (editingCategoryId.value) {
    emit('update', {
      id: editingCategoryId.value,
      name: categoryForm.name,
      icon: categoryForm.icon,
      color: categoryForm.color,
    });
  } else {
    emit('add', {
      id: `category_${Date.now()}`,
      name: categoryForm.name,
      icon: categoryForm.icon,
      color: categoryForm.color,
    });
  }

  // 重置表单
  categoryForm.name = '';
  categoryForm.icon = 'folder';
  categoryForm.color = 'grey';
  editingCategoryId.value = null;
  showAddCategoryDialog.value = false;
};
</script>
