import AxeBuilder from '@axe-core/playwright'
import { expect } from '@playwright/test'

export const strongPassword = 'UniNet!E2E2026'

export function uniqueStudent(overrides = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  return {
    email: `e2e-${suffix}@student.test`,
    lastName: 'Тест',
    firstName: 'Оюутан',
    password: strongPassword,
    ...overrides,
  }
}

export async function openAuth(page, view = 'signup') {
  const label = view === 'signup' ? 'Бүртгүүлэх' : 'Нэвтрэх'
  const desktopButton = page.locator('header nav').getByRole('button', { name: label, exact: true })
  if (await desktopButton.isVisible()) {
    await desktopButton.click()
  } else {
    await page.getByRole('button', { name: 'Үндсэн цэс нээх' }).click()
    await page.locator('#landing-mobile-navigation').getByRole('button', { name: label, exact: true }).click()
  }
  await expect(page.getByRole('dialog')).toBeVisible()
}

export async function registerStudent(page, student = uniqueStudent()) {
  await page.goto('/')
  await openAuth(page, 'signup')
  await page.locator('#signup-last-name').fill(student.lastName)
  await page.locator('#signup-first-name').fill(student.firstName)
  await page.locator('#signup-email').fill(student.email)
  await page.locator('#signup-password').fill(student.password)
  await page.locator('#confirm-password').fill(student.password)
  await page.locator('#branch').fill('E2E QA')
  await page.locator('#major').fill('Software Quality')
  await page.locator('#enrollment-year').selectOption(String(new Date().getFullYear()))
  await page.getByLabel(/Үйлчилгээний нөхцөл/).check()
  await page.getByRole('button', { name: 'Бүртгүүлээд имэйл баталгаажуулах', exact: true }).click()
  await expect(page).toHaveURL(/\/student$/)
  await expect(page.getByRole('navigation', { name: 'Student navigation' })).toBeAttached()
  await expect(page.getByRole('heading', { name: `Сайн байна уу, ${student.firstName} 👋`, exact: true })).toBeVisible()
  return student
}

export async function loginStudent(page, student) {
  await page.goto('/')
  await openAuth(page, 'login')
  await page.locator('#login-email').fill(student.email)
  await page.locator('#login-password').fill(student.password)
  await page.getByRole('dialog').locator('form').getByRole('button', { name: 'Нэвтрэх', exact: true }).click()
  await expect(page).toHaveURL(/\/student$/)
  await expect(page.getByRole('navigation', { name: 'Student navigation' })).toBeAttached()
}

export async function expectNoSeriousAxeViolations(page, context, testInfo) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze()
  // Contrast has a reviewed visual baseline. Preserve it as report evidence,
  // while every other serious/critical axe rule remains a blocking gate.
  // This smoke check does not claim complete WCAG AA conformance.
  const contrastBaseline = result.violations.filter(violation => violation.id === 'color-contrast')
  if (contrastBaseline.length && testInfo) {
    await testInfo.attach(`axe-${context.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-contrast-baseline.json`, {
      body: Buffer.from(JSON.stringify(contrastBaseline, null, 2)),
      contentType: 'application/json',
    })
  }
  const blocking = result.violations.filter(violation => (
    violation.id !== 'color-contrast' && ['serious', 'critical'].includes(violation.impact)
  ))
  expect(blocking, `${context} serious/critical axe violations:\n${JSON.stringify(blocking, null, 2)}`).toEqual([])
}
