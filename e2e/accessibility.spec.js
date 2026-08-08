import { expect, test } from '@playwright/test'
import { expectNoSeriousAxeViolations, openAuth, registerStudent, uniqueStudent } from './helpers.js'

test('landing and authentication dialog pass axe smoke and keyboard focus checks', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'mn')
  await expectNoSeriousAxeViolations(page, 'landing', testInfo)

  await openAuth(page, 'login')
  await page.locator('#login-email').focus()
  await expect(page.locator('#login-email')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.locator('#login-password')).toBeFocused()
  await expectNoSeriousAxeViolations(page, 'login dialog', testInfo)

  await page.getByRole('button', { name: 'Хаах' }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('authenticated student dashboard passes axe smoke', async ({ page }, testInfo) => {
  await registerStudent(page, uniqueStudent({ firstName: 'A11y', lastName: 'E2E' }))
  await expectNoSeriousAxeViolations(page, 'student dashboard', testInfo)
})

test('@mobile mobile navigation reaches auth and closes dashboard drawer after navigation', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Үндсэн цэс нээх' }).click()
  await expect(page.locator('#landing-mobile-navigation')).toBeVisible()
  await expectNoSeriousAxeViolations(page, 'mobile landing navigation', testInfo)

  const student = uniqueStudent({ firstName: 'Mobile', lastName: 'E2E' })
  await page.locator('#landing-mobile-navigation').getByRole('button', { name: 'Бүртгүүлэх', exact: true }).click()
  await page.locator('#signup-last-name').fill(student.lastName)
  await page.locator('#signup-first-name').fill(student.firstName)
  await page.locator('#signup-email').fill(student.email)
  await page.locator('#signup-password').fill(student.password)
  await page.locator('#confirm-password').fill(student.password)
  await page.locator('#branch').fill('Mobile QA')
  await page.locator('#major').fill('Responsive Design')
  await page.locator('#enrollment-year').selectOption(String(new Date().getFullYear()))
  await page.getByLabel(/Үйлчилгээний нөхцөл/).check()
  await page.getByRole('button', { name: 'Бүртгүүлээд имэйл баталгаажуулах', exact: true }).click()
  await expect(page).toHaveURL(/\/student$/)

  await page.getByRole('button', { name: 'Navigation drawer нээх' }).click()
  const drawer = page.locator('#student-sidebar')
  await expect(drawer).toBeVisible()
  await drawer.getByRole('button', { name: 'Миний сургууль', exact: true }).click()
  await expect(page).toHaveURL(/\/student\/my-university$/)
  await expect(page.getByRole('button', { name: 'Цэс хаах' })).toHaveCount(0)
})
