import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const assertions = []
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
  assertions.push(message)
}

const notification = read('src/dashboard/NotificationDropdown.jsx')
const dashboard = read('src/dashboard/DashboardLayout.jsx')
const student = read('src/student/StudentExperience.jsx')
const universityLogo = read('src/dashboard/UniversityLogo.jsx')
const studentUi = read('src/student/StudentUI.jsx')
const landing = read('src/Uninetlanding.jsx')
const operations = read('src/operations/OperationsExperience.jsx')
const styles = read('src/index.css')

assert(notification.includes('topbar-action') && notification.includes('uninet-popover'), 'Notification trigger and dropdown include motion/elevation effects')
assert(notification.includes('<Bell') && notification.includes('notification-bell-active'), 'Notification trigger uses a Lucide Bell with unread feedback')
assert(dashboard.includes('topbar-action') && dashboard.includes('profile-menu-item'), 'Staff/Admin/Platform profile control has interactive effects')
assert(student.includes('topbar-action') && student.includes('profile-menu-item'), 'Student profile control has interactive effects')
assert(styles.includes('@keyframes uninet-popover-in') && styles.includes('.profile-menu-item:hover'), 'Shared topbar effects are defined with reduced-motion support inherited from the app')

for (const code of ['МУИС', 'ШУТИС', 'МУБИС', 'АШУҮИС', 'ХААИС']) {
  assert(universityLogo.includes(`"${code}"`), `${code} logo mapping exists`)
}
assert(universityLogo.includes('referrerPolicy="no-referrer"') && universityLogo.includes('onError={() => setFailed(true)}'), 'University logos include privacy-aware loading and a safe fallback')
assert(dashboard.includes('<UniversityLogo university={universityName}') && student.includes('<UniversityLogo university={studentUniversityName}'), 'Collapsed role and student sidebars render the university logo')
assert(!dashboard.includes('user.university.slice(0, 2)') && !student.includes('profile.university.slice(0, 2)'), 'Collapsed sidebars no longer render two-letter university initials')
assert(dashboard.includes('items-start px-8 py-5') && student.includes('items-start px-8 py-5'), 'Expanded university name aligns with the navigation icon column')

assert(studentUi.includes('import { Bookmark } from "lucide-react"') && studentUi.includes('<Bookmark aria-hidden="true"'), 'Opportunity cards use the open-source Lucide Bookmark icon')
assert(studentUi.includes('aria-pressed={saved}') && studentUi.includes('title={actionLabel}'), 'Icon-only bookmark button remains accessible')
assert(landing.includes('Wand2, Bookmark') && landing.includes('aria-pressed={isSaved}'), 'Landing feed card bookmark is icon-only and accessible')

assert(operations.includes('function AuditValue') && operations.includes('<details key={row.id}'), 'Audit log uses responsive expandable cards')
assert(operations.includes('Өөрчлөлтийн snapshot') && operations.includes('lg:grid-cols-2'), 'Audit previous/next values render in a wrapping responsive layout')
assert(operations.includes('SelectFilter label="Severity"') && operations.includes('haystack.includes'), 'Audit log includes severity and text filters')
assert(!operations.includes('<DataTable rows={rows} columns={[{ key: "actor"'), 'Audit log no longer uses the horizontally scrolling wide table')

console.log(`Phase 4 UI polish smoke checks passed (${assertions.length} assertions).`)
