#!/bin/bash
# Запустить ПОСЛЕ деплоя на Vercel
# Заменить YOUR_VERCEL_URL на реальный URL

TELEGRAM_TOKEN="8873356621:AAEm7vaEBbN1L0ooyNPXoosphXxDQ0fpdkw"
VERCEL_URL="YOUR_VERCEL_URL"  # например: https://finance-bot-askar.vercel.app

curl "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${VERCEL_URL}/api/webhook"
