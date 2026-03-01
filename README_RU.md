# jperf

[![npm version](https://img.shields.io/npm/v/jperf.svg)](https://www.npmjs.com/package/jperf)

> MCP-сервер для профилирования Java-приложений через утилиты JDK (jcmd, jfr, jps)

Позволяет AI-ассистентам диагностировать производительность, анализировать потоки и просматривать JFR-записи без ручного использования CLI.

📦 **Установка**: `npm install -g jperf` или через npx  
🌐 **npm**: https://www.npmjs.com/package/jperf

## Требования

- **Node.js** v18+
- **JDK** 8u262+ или 11+ с поддержкой JFR
- Утилиты JDK (`jps`, `jcmd`, `jfr`) в `PATH`

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
    "jperf": {
      "command": "npx",
      "args": ["-y", "jperf"]
    }
  }
}
```

#### Вариант 2: Через npm link (для разработки)

Для локальной разработки с живыми изменениями:

```json
{
  "mcpServers": {
    "jperf": {
      "command": "jperf"
    }
  }
}
```

Требуется: `cd /путь/к/mcp-jperf && npm link -g`

#### Вариант 3: Прямой путь

```json
{
  "mcpServers": {
    "jperf": {
      "command": "node",
      "args": ["/путь/к/mcp-jperf/dist/index.js"],
      "cwd": "/путь/к/mcp-jperf"
    }
  }
}
```

### Claude Desktop

Редактировать `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) или `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "jperf": {
      "command": "npx",
      "args": ["-y", "jperf"]
    }
  }
}
```

### Continue.dev

Редактировать `.continue/config.json`:

```json
{
  "mcpServers": {
    "jperf": {
      "command": "npx",
      "args": ["-y", "jperf"]
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
