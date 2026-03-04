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
| `start_profiling` | Запуск JFR-записи с `settings=profile`. Параметры: `pid`, `duration` (сек). Опционально: `memorysize` (напр. "20M"), `stackdepth` (по умолчанию 128). |
| `list_jfr_recordings` | Список активных JFR-записей процесса. Использовать перед `stop_profiling` для получения `recordingId`. |
| `stop_profiling` | Остановка записи и сохранение в recordings/new_profile.jfr. Требует `pid` и `recordingId`. |
| `check_deadlock` | Проверка Java-level deadlock. Возвращает JSON с потоками, блокировками и циклом. |
| `analyze_threads` | Дамп потоков (jstack) со сводкой по deadlock. Параметры: `pid`, опционально `topN` (по умолчанию 10). |
| `heap_histogram` | Гистограмма классов (GC.class_histogram). Параметры: `pid`, опционально `topN` (20), `all` (вызывает full GC — может приостановить приложение). |
| `heap_dump` | Создание .hprof дампа кучи для MAT/VisualVM. Параметр: `pid`. Сохраняется в recordings/heap_dump.hprof. |
| `heap_info` | Краткая сводка по куче. Параметр: `pid`. |
| `vm_info` | Информация о JVM: uptime, version, flags. Параметр: `pid`. |
| `trace_method` | Построение дерева вызовов метода из .jfr. Параметры: `className`, `methodName`. Опционально: `filepath` (по умолчанию new_profile), `topN`. |
| `parse_jfr_summary` | Разбор .jfr в сводку: топ методов, GC, аномалии. Опционально: `filepath` (по умолчанию new_profile), `events`, `topN`. |
| `profile_memory` | Профиль по памяти: топ аллокаторов, GC, утечки. Опционально: `filepath` (по умолчанию new_profile), `topN`. |
| `profile_time` | Профиль по времени (узкие места CPU). Опционально: `filepath` (по умолчанию new_profile), `topN`. |
| `profile_frequency` | Профиль по частоте вызовов. Опционально: `filepath` (по умолчанию new_profile), `topN`. |

## Пример работы

1. **Список процессов** → `list_java_processes`
2. **Старт записи** → `start_profiling` с `pid` и `duration` (например 60)
3. Подождать `duration` секунд
4. **Проверить записи** (опционально) → `list_jfr_recordings` для получения `recordingId`
5. **Остановка и сохранение** → `stop_profiling` с `pid` и `recordingId`
6. **Анализ** → Использовать `parse_jfr_summary`, `profile_memory`, `profile_time`, `profile_frequency` или `trace_method` (filepath по умолчанию — new_profile)

## Ограничения

- **Семплинг**: JFR делает снимки ~10 мс; быстрые методы могут не попасть в ExecutionSample
- **Локальность**: Работает только на машине, где запущен MCP
- **Права**: Нужен доступ к целевой JVM (пользователь MCP = пользователь JVM)
