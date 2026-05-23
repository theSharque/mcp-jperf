# javaperf

[![npm version](https://img.shields.io/npm/v/javaperf.svg)](https://www.npmjs.com/package/javaperf)

> MCP-сервер для профилирования Java-приложений через утилиты JDK (jcmd, jfr, jps)

Позволяет AI-ассистентам диагностировать производительность, анализировать потоки и просматривать JFR-записи без ручного использования CLI.

📦 **Установка**: `npm install -g javaperf` или через npx
🌐 **npm**: https://www.npmjs.com/package/javaperf

## Как подключить к Claude Desktop / IDE

Добавьте сервер в конфиг MCP. Пример для **claude_desktop_config.json**:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

Для **Cursor IDE**: Settings → Features → Model Context Protocol → Edit Config, затем добавьте тот же блок в `mcpServers`. Подробнее в разделе [Интеграция](#интеграция).

## Требования

- **Node.js** v18+
- **JDK** 8u262+ или 11+ с поддержкой JFR

Утилиты JDK (`jps`, `jcmd`, `jfr`) находятся автоматически через `JAVA_HOME` или `which java`. Если не найдены — задайте `JAVA_HOME` на корень JDK.

## Быстрый старт

### Для пользователей (через npm)

```bash
# Установка не требуется — можно использовать прямо в Cursor/Claude Desktop
# Настройте по инструкции в разделе Интеграция ниже
```

### Для разработчиков

1. Клонируйте репозиторий:
```bash
git clone https://github.com/theSharque/mcp-jperf.git
cd mcp-jperf
```

2. Установите зависимости:
```bash
npm install
```

3. Соберите проект:
```bash
npm run build
```

## Использование

### Режим разработки

```bash
npm run dev
```

### Production

```bash
npm start
```

### MCP Inspector

Отладка и тестирование:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

## Интеграция

### Cursor IDE

1. Откройте Cursor Settings → Features → Model Context Protocol
2. Нажмите "Edit Config"
3. Добавьте одну из конфигураций ниже

#### Вариант 1: Через npm (рекомендуется)

Устанавливается из npm автоматически:

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

#### Вариант 2: Через npm link (для разработки)

Для локальной разработки с живыми изменениями:

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "javaperf"
    }
  }
}
```

Требуется: `cd /путь/к/mcp-jperf && npm link -g`

#### Вариант 3: Прямой путь

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "${workspaceFolder}",
      "env": {
        "JAVA_HOME": "/путь/к/вашему/jdk"
      }
    }
  }
}
```

Если `list_java_processes` выдаёт "jps not found", MCP-сервер может не наследовать `JAVA_HOME` из shell. Добавьте блок `env` с путём к корню JDK (например `/usr/lib/jvm/java-17` или `~/.sdkman/candidates/java/current`).

### Claude Desktop

Редактировать `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

### Continue.dev

Редактировать `.continue/config.json`:

```json
{
  "mcpServers": {
    "javaperf": {
      "command": "npx",
      "args": ["-y", "javaperf"]
    }
  }
}
```

## Инструменты

| Инструмент | Описание |
|------------|----------|
| `list_java_processes` | Список Java-процессов (pid, mainClass, args). Параметр `topN` (по умолчанию 10) ограничивает вывод. |
| `start_profiling` | Запись JFR. Параметры: `pid`, `duration` (сек). Опционально: `preset` (если не задан — эффективно `profile`), `settingsFile` (`.jfc`, взаимоисключено с `preset`), `memorysize`, `stackdepth` (128 по умолчанию). |
| `profile_jfr_network` | Сводка по сокетам из `.jfr` (`jdk.SocketRead`, `jdk.SocketWrite`). Опционально `filepath`, `topN`. |
| `profile_jfr_file_io` | Сводка по файлам (`jdk.FileRead`, `jdk.FileWrite`). Опционально `filepath`, `topN`. |
| `profile_jfr_locks` | Контенция: `JavaMonitorBlocked` и j.u.c (`ThreadPark`). Опционально `filepath`, `topN`. Live: `analyze_threads structured=true`. |
| `profile_jfr_native` | Нативные CPU-хотспоты (`jdk.NativeMethodSample`). Опционально `filepath`, `topN`. |
| `native_memory_summary` | `jcmd VM.native_memory summary` — нужен `-XX:NativeMemoryTracking=summary` или `detail`. Параметр: `pid`. |
| `gc_class_stats` | `jcmd GC.class_stats` (часто только JDK 21+). Параметр: `pid`. |
| `gc_finalizer_info` | `jcmd GC.finalizer_info`. Параметр: `pid`. |
| `compiler_codecache` | `jcmd Compiler.codecache`. Параметр: `pid`. |
| `compiler_queue` | `jcmd Compiler.queue`. Параметр: `pid`. |
| `list_jfr_recordings` | Список активных JFR-записей процесса. Использовать перед `stop_profiling` для получения `recordingId`. |
| `stop_profiling` | Остановка записи и сохранение в recordings/new_profile.jfr. Требует `pid` и `recordingId`. |
| `check_deadlock` | Проверка Java-level deadlock. Возвращает JSON с потоками, блокировками и циклом. |
| `analyze_threads` | Дамп потоков (jstack) со сводкой по deadlock. Параметры: `pid`, опционально `topN`, `structured` (JSON с цепочками ожидания). Live-снимок; история: `profile_jfr_locks`. |
| `heap_histogram` | Гистограмма классов (GC.class_histogram). Параметры: `pid`, опционально `topN` (20), `all` (вызывает full GC). Статический снимок; для роста — `heap_live_histogram_diff`. |
| `heap_live_histogram_diff` | Два снимка гистограммы с интервалом `intervalSeconds` (по умолчанию 5). Топ классов по росту экземпляров/байт. Первый шаг при подозрении на утечку. |
| `heap_dump` | Создание .hprof для MAT/VisualVM. После `heap_live_histogram_diff` — Path to GC Roots в MAT. Параметр: `pid`. |
| `heap_info` | Краткая сводка по куче. Параметр: `pid`. |
| `vm_info` | Информация о JVM: uptime, version, flags. Параметр: `pid`. |
| `trace_method` | Построение дерева вызовов метода из .jfr. Параметры: `className`, `methodName`. Опционально: `filepath` (по умолчанию new_profile), `topN`. |
| `parse_jfr_summary` | Разбор .jfr в сводку: топ методов, GC, аномалии. Опционально: `filepath`, `events`, `topN`. |
| `profile_memory` | Профиль памяти: аллокаторы по байтам/счётчику, стеки, OldObjectSample по классам. Опционально: `filepath`, `topN`, `sortBy`. См. `gc_efficiency`, `heap_live_histogram_diff`. |
| `gc_efficiency` | Эффективность GC из .jfr: пауза vs освобождённые байты. Опционально: `filepath`, `topN`. После `stop_profiling`. |
| `profile_time` | Профиль по времени (узкие места CPU). Опционально: `filepath` (по умолчанию new_profile), `topN`. |
| `profile_frequency` | Профиль по частоте вызовов. Опционально: `filepath` (по умолчанию new_profile), `topN`. |

## Пример работы

1. **Список процессов** → `list_java_processes`
2. **Старт записи** → `start_profiling` с `pid` и `duration` (например 60)
3. Подождать `duration` секунд
4. **Проверить записи** (опционально) → `list_jfr_recordings` для получения `recordingId`
5. **Остановка и сохранение** → `stop_profiling` с `pid` и `recordingId`
6. **Анализ** → `parse_jfr_summary`, `profile_memory`, `gc_efficiency`, `profile_time`, `profile_frequency`, `trace_method`, `profile_jfr_network`, `profile_jfr_file_io`, `profile_jfr_locks`, `profile_jfr_native` (в записи должны быть нужные типы событий — см. `start_profiling`: `preset` или `settingsFile` с `.jfc`)

## Пример: гипотеза об утечке памяти

1. **Список процессов** → `list_java_processes`
2. **Растущие классы** → `heap_live_histogram_diff` с `pid`, `intervalSeconds: 5`
3. **Запись под нагрузкой** → `start_profiling` → ожидание → `stop_profiling`
4. **Профиль аллокаций** → `profile_memory` (`oldObjectSamplesByClass` для подозрительного класса)
5. **Давление GC** → `gc_efficiency` на том же `.jfr`
6. **Подтверждение удержания** → `heap_dump` → Eclipse MAT → Path to GC Roots (исключить weak/soft)
7. AI формирует связную гипотезу (отдельного tool нет)

## Удалённая JVM и stdio MCP

javaperf работает через stdio MCP и цепляется к JVM только **локально** (`jps`/`jcmd` на той же машине и том же пользователе).

Чтобы смотреть процесс на другом хосте:

- запускайте MCP/IDE-сессию **на том же хосте**, что и приложение (SSH workspace, среда на сервере, CI job на нужной машине и т.д.);
- простой просмотр с другой машины без запуска MCP там не поддерживается.

Те же ограничения («локально», один пользователь) указаны ниже в **Ограничения**.

## Ограничения

- **Семплинг**: JFR делает снимки ~10 мс; быстрые методы могут не попасть в ExecutionSample
- **Локальность**: Работает только на машине, где запущен MCP
- **Права**: Нужен доступ к целевой JVM (пользователь MCP = пользователь JVM)
