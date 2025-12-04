from pyngrok import ngrok

# Открываем публичный HTTPS туннель к локальному серверу на порту 3000
public_url = ngrok.connect(3000, "http")
print("Ngrok URL:", public_url)

# Туннель будет работать, пока скрипт выполняется
input("Нажмите Enter, чтобы остановить ngrok...\n")
