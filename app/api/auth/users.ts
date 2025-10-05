// Файл для управления пользователями через переменные окружения
// Пользователи теперь хранятся в .env файле

import { createHash } from "crypto"

interface User {
  id: string
  email: string
  login: string
  password: string
  status: "active" | "blocked"
  role: "admin" | "user"
  createdAt: string
}

// Парсим пользователей из переменных окружения
function parseUsersFromEnv(): User[] {
  const users: User[] = []

  let userIndex = 1

  while (true) {
    const userEnv = process.env[`OSINT_USER_${userIndex}`]

    if (!userEnv) {
      break // Больше пользователей нет
    }

    try {
      // Формат: login:password:email:role:status
      const [login, password, email, role = "user", status = "active"] = userEnv.split(":")

      if (login && password && email) {
        users.push({
          id: userIndex.toString(),
          login: login.trim(),
          password: hashPassword(password.trim()),
          email: email.trim(),
          role: (role.trim() as "admin" | "user") || "user",
          status: (status.trim() as "active" | "blocked") || "active",
          createdAt: "2024-01-01T00:00:00Z",
        })
      }
    } catch (error) {
      console.error(`Error parsing OSINT_USER_${userIndex}:`, error)
    }

    userIndex++
  }

  const jaguarPassword = process.env.OSINT_JAGUAR_PASSWORD
  if (jaguarPassword) {
    users.push({
      id: "jaguar",
      email: "jaguar@osinthub.local",
      login: "jaguar",
      password: hashPassword(jaguarPassword),
      status: "active",
      role: "admin",
      createdAt: "2024-01-01T00:00:00Z",
    })
  }

  const adminPassword = process.env.OSINT_ADMIN_PASSWORD
  if (users.length === 0 && adminPassword) {
    console.warn("⚠️ No users found in environment variables. Creating default admin.")
    users.push({
      id: "1",
      email: "admin@osinthub.local",
      login: "admin",
      password: hashPassword(adminPassword),
      status: "active",
      role: "admin",
      createdAt: "2024-01-01T00:00:00Z",
    })
  }

  return users
}

// Хеш функция для безопасного хранения паролей
function hashPassword(password: string): string {
  return createHash("sha256").update(password).digest("hex")
}

// Получаем пользователей из переменных окружения
export const AUTHORIZED_USERS = parseUsersFromEnv()

// Функция для проверки пользователя
export function findUser(login: string, password: string) {
  const hashedPassword = hashPassword(password)
  return AUTHORIZED_USERS.find(
    (user) => user.login === login && user.password === hashedPassword && user.status === "active",
  )
}

// Функция для получения всех активных пользователей (для админки)
export function getAllUsers() {
  return AUTHORIZED_USERS.filter((user) => user.status === "active").map((user) => ({
    ...user,
    password: "***", // Скрываем пароли
  }))
}

// Логирование загруженных пользователей (без паролей)
console.log(
  "👥 Loaded users:",
  AUTHORIZED_USERS.map((u) => ({
    login: u.login,
    role: u.role,
    status: u.status,
  })),
)
