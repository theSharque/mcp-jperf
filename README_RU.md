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
git clone <repo-url>
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
| `start_profiling` | Запуск JFR-записи с `settings=profile`. Параметры: `pid`, `duration` (сек), опционально `recordingName`. |
| `stop_profiling` | Остановка записи и сохранение в файл. Требует `pid` и `recordingId` из start_profiling. |
| `analyze_threads` | Дамп потоков (jstack). Параметры: `pid`, опционально `topN` (по умолчанию 10). |
| `heap_histogram` | Гистограмма классов (GC.class_histogram). Топ классов по количеству объектов и памяти. Параметры: `pid`, опционально `topN` (20), `all`. |
| `heap_dump` | Создание .hprof дампа кучи для MAT/VisualVM. Параметр: `pid`. Сохраняется в recordings/heap_dump.hprof. |
| `heap_info` | Краткая сводка по куче. Параметр: `pid`. |
| `vm_info` | Информация о JVM: uptime, version, flags. Параметр: `pid`. |
| `trace_method` | Построение дерева вызовов метода из .jfr. Параметры: `filepath`, `className`, `methodName`, опционально `topN`. |
| `parse_jfr_summary` | Разбор .jfr в сводку: топ методов, GC, аномалии. Параметры: `filepath`, опционально `events`, `topN`. |
| `profile_memory` | Профиль по памяти: топ аллокаторов, GC, утечки. Параметры: `filepath`, опционально `topN`. |
| `profile_time` | Профиль по времени (узкие места CPU). Параметры: `filepath`, опционально `topN`. |
| `profile_frequency` | Профиль по частоте вызовов. Параметры: `filepath`, опционально `topN`. |

## Пример работы

1. **Список процессов** → `list_java_processes`
2. **Старт записи** → `start_profiling` с `pid` и `duration` (например 60)
3. Подождать `duration` секунд
4. **Остановка и сохранение** → `stop_profiling` с `pid` и `recordingId`
5. **Анализ** → Использовать `parse_jfr_summary`, `profile_memory`, `profile_time`, `profile_frequency` или `trace_method` с путём к сохранённому .jfr

## Ограничения

- **Семплинг**: JFR делает снимки ~10 мс; быстрые методы могут не попасть в ExecutionSample
- **Локальность**: Работает только на машине, где запущен MCP
- **Права**: Нужен доступ к целевой JVM (пользователь MCP = пользователь JVM)
