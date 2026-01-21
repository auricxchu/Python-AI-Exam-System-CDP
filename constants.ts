import { ExamConfig, Question } from './types';

export const DEFAULT_QUESTIONS: Question[] = [
  { id: "s1", title: "Hello World", difficulty: "简单", description: "编写一个函数 `say_hello()`，返回字符串 'Hello, World!'。", template: "def say_hello():\n    pass\n\nprint(say_hello())" },
  { id: "s2", title: "两数之和", difficulty: "简单", description: "编写一个函数 `add(a, b)`，返回两个数字的和。", template: "def add(a, b):\n    pass\n\nprint(add(3, 5))" },
  { id: "s3", title: "判断偶数", difficulty: "简单", description: "编写一个函数 `is_even(n)`，如果 n 是偶数返回 True，否则返回 False。", template: "def is_even(n):\n    pass\n\nprint(is_even(4))" },
  { id: "s4", title: "列表最大值", difficulty: "简单", description: "编写一个函数 `find_max(nums)`，返回列表中的最大值，不能使用内置 max 函数。", template: "def find_max(nums):\n    pass\n\nprint(find_max([1, 5, 2]))" },
  { id: "m1", title: "斐波那契数列", difficulty: "中等", description: "编写一个函数 `fibonacci(n)`，返回斐波那契数列的第 n 项。", template: "def fibonacci(n):\n    pass\n\nprint(fibonacci(10))" },
  { id: "m2", title: "列表去重排序", difficulty: "中等", description: "编写函数 `unique_sort(nums)`，对列表去重并从大到小排序。", template: "def unique_sort(nums):\n    pass\n\nprint(unique_sort([1, 2, 2, 3]))" },
  { id: "h1", title: "简易装饰器", difficulty: "困难", description: "编写一个装饰器 `timer`，打印函数执行时间。", template: "import time\ndef timer(func):\n    pass\n\n@timer\ndef run():\n    pass" },
  { id: "h2", title: "有效括号", difficulty: "困难", description: "给定一个只包括 '('，')'，'{'，'}'，'['，']' 的字符串，判断字符串是否有效。", template: "def isValid(s):\n    pass\n\nprint(isValid('()[]{}'))" },
  { id: "h3", title: "二分查找", difficulty: "困难", description: "编写二分查找算法，在有序数组中查找目标值 target 的索引。", template: "def binary_search(nums, target):\n    pass\n\nprint(binary_search([1,2,3,4,5], 4))" }
];

export const DEFAULT_CONFIG: ExamConfig = {
  examTitle: "Python 阶段性随机抽测 (默认)",
  accessKey: "",
  duration: 60,
  ruleSettings: {
    "简单": { count: 3, points: 10 },
    "中等": { count: 2, points: 20 },
    "困难": { count: 2, points: 15 }
  },
  questionBank: DEFAULT_QUESTIONS
};