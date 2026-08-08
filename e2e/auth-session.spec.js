import { expect, test } from '@playwright/test'
import { loginStudent, registerStudent, uniqueStudent } from './helpers.js'

test.describe.configure({ mode: 'serial' })

test('register, refresh-cookie restore, logout and login lifecycle', async ({ page }) => {
  const student = await registerStudent(page)

  await page.reload()
  await expect(page).toHaveURL(/\/student$/)
  await expect(page.getByRole('heading', { name: `Сайн байна уу, ${student.firstName} 👋`, exact: true })).toBeVisible()

  const profileTrigger = page.locator('header button[aria-haspopup="menu"]')
  await profileTrigger.hover()
  await expect(page.getByRole('menuitem', { name: 'Гарах', exact: true })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Гарах', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('header nav').getByRole('button', { name: 'Нэвтрэх', exact: true })).toBeVisible()

  await loginStudent(page, student)
  await expect(page.getByRole('heading', { name: `Сайн байна уу, ${student.firstName} 👋`, exact: true })).toBeVisible()
})

test('student deep-link cannot expose an operations dashboard', async ({ page }) => {
  await registerStudent(page, uniqueStudent({ firstName: 'Guard', lastName: 'E2E' }))

  await page.goto('/admin')
  await expect(page.getByRole('navigation', { name: 'Student navigation' })).toBeAttached()
  await expect(page.getByRole('navigation', { name: /University Admin navigation/i })).toHaveCount(0)
  await expect(page.getByText('University Admin Dashboard', { exact: true })).toHaveCount(0)
})
