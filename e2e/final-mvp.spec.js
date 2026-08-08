import { expect, test } from '@playwright/test'
import { openAuth } from './helpers.js'

const password = process.env.E2E_DEMO_PASSWORD || process.env.SEED_ROLE_PASSWORD

async function login(page, email, expectedPath) {
  if (!password) throw new Error('E2E_DEMO_PASSWORD or SEED_ROLE_PASSWORD is required for final MVP demo tests.')
  await page.goto('/')
  await openAuth(page, 'login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('dialog').locator('form').getByRole('button', { name: 'Нэвтрэх', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`${expectedPath}$`))
}

async function logout(page) {
  const profile = page.locator('header button[aria-haspopup="menu"]')
  await profile.hover()
  await page.getByRole('menuitem', { name: 'Гарах', exact: true }).click()
  await expect(page).toHaveURL(/\/$/)
}

test.describe.configure({ mode: 'serial' })

test('seeded Staff can see deterministic registration/application/survey demo data', async ({ page }) => {
  await login(page, 'staff@num.edu.mn', '/staff')
  await page.goto('/staff/registrations')
  await expect(page.getByRole('heading', { name: 'Арга хэмжээний бүртгэл' })).toBeVisible()
  await expect(page.getByText('Final MVP Backend Demo Event')).toBeVisible()
  await page.goto('/staff/applications')
  await expect(page.getByRole('heading', { name: 'Өргөдлийн удирдлага' })).toBeVisible()
  await expect(page.getByText('Final MVP Full-stack Internship')).toBeVisible()
  await page.goto('/staff/forms')
  await expect(page.getByText('Final MVP Student Feedback')).toBeVisible()
})

test('Student sees dedicated 404 screen and tenant-owned demo data', async ({ page }) => {
  await login(page, 'student@num.edu.mn', '/student')
  await page.goto('/student/registrations')
  await expect(page.getByText('Final MVP Backend Demo Event')).toBeVisible()
  await page.goto('/student/does-not-exist')
  await expect(page.getByText('404 · Олдсонгүй')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Хүссэн мэдээлэл олдсонгүй' })).toBeVisible()
})

test('Platform Super Admin can open university/domain management UI', async ({ page }) => {
  await login(page, process.env.SEED_SUPER_ADMIN_EMAIL || 'superadmin@uninet.local', '/platform')
  await page.goto('/platform/universities')
  await expect(page.getByRole('heading', { name: 'Их сургуулийн удирдлага' })).toBeVisible()
  await page.getByRole('button', { name: 'Удирдах' }).first().click()
  await expect(page.getByText(/Domain management/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Шинэ домэйн нэмэх' })).toBeVisible()
  await logout(page)
})
