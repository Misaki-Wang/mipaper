const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function createCalendarPicker({ shell, input, button, getAvailableDates, getValue, onSelect }) {
  const popover = document.createElement("div");
  popover.className = "date-picker-popover";
  popover.hidden = true;
  shell.appendChild(popover);

  let isOpen = false;
  let visibleMonth = "";

  function syncInput() {
    input.value = getValue() || "";
  }

  function getSortedDates() {
    return [...new Set((getAvailableDates?.() || []).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  }

  function getInitialMonth(dates) {
    const current = getValue();
    if (current) {
      return current.slice(0, 7);
    }
    if (dates.length) {
      return dates[dates.length - 1].slice(0, 7);
    }
    return formatMonthKey(new Date());
  }

  function render() {
    const dates = getSortedDates();
    const availableSet = new Set(dates);
    const selected = getValue();

    if (!visibleMonth) {
      visibleMonth = getInitialMonth(dates);
    }

    const minMonth = dates[0]?.slice(0, 7) || visibleMonth;
    const maxMonth = dates[dates.length - 1]?.slice(0, 7) || visibleMonth;
    if (visibleMonth < minMonth) {
      visibleMonth = minMonth;
    }
    if (visibleMonth > maxMonth) {
      visibleMonth = maxMonth;
    }

    const monthDate = parseMonthKey(visibleMonth);
    const monthLabel = new Intl.DateTimeFormat("en", { year: "numeric", month: "long" }).format(monthDate);
    const days = buildCalendarDays(monthDate);

    popover.innerHTML = `
      <div class="date-picker-head">
        <button class="date-picker-nav" type="button" data-calendar-nav="prev" ${visibleMonth <= minMonth ? "disabled" : ""}>
          ‹
        </button>
        <strong class="date-picker-title">${monthLabel}</strong>
        <button class="date-picker-nav" type="button" data-calendar-nav="next" ${visibleMonth >= maxMonth ? "disabled" : ""}>
          ›
        </button>
      </div>
      <div class="date-picker-weekdays">
        ${WEEKDAY_LABELS.map((label) => `<span>${label}</span>`).join("")}
      </div>
      <div class="date-picker-grid">
        ${days
          .map((day) => {
            if (!day.inMonth) {
              return `<span class="date-picker-day is-outside" aria-hidden="true"></span>`;
            }
            const disabled = !availableSet.has(day.iso);
            const active = selected === day.iso;
            return `
              <button
                class="date-picker-day${active ? " is-active" : ""}${disabled ? " is-disabled" : ""}"
                type="button"
                data-calendar-date="${day.iso}"
                ${disabled ? "disabled" : ""}
              >
                <span>${day.date.getDate()}</span>
              </button>
            `;
          })
          .join("")}
      </div>
    `;

    popover.querySelectorAll("[data-calendar-nav]").forEach((navButton) => {
      navButton.addEventListener("click", () => {
        visibleMonth = shiftMonth(visibleMonth, navButton.dataset.calendarNav === "next" ? 1 : -1);
        render();
      });
    });

    popover.querySelectorAll("[data-calendar-date]").forEach((dayButton) => {
      dayButton.addEventListener("click", async () => {
        const iso = dayButton.dataset.calendarDate;
        if (!iso) {
          return;
        }
        await onSelect(iso);
        syncInput();
        close();
      });
    });

    syncInput();
    button.disabled = !dates.length;
  }

  function open() {
    render();
    isOpen = true;
    popover.hidden = false;
    shell.classList.add("is-open");
  }

  function close() {
    isOpen = false;
    popover.hidden = true;
    shell.classList.remove("is-open");
  }

  function toggle() {
    if (isOpen) {
      close();
      return;
    }
    open();
  }

  button.addEventListener("click", toggle);
  input.addEventListener("click", open);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open();
    }
    if (event.key === "Escape") {
      close();
    }
  });

  document.addEventListener("click", (event) => {
    if (!shell.contains(event.target)) {
      close();
    }
  });

  return {
    refresh() {
      visibleMonth = getInitialMonth(getSortedDates());
      render();
      if (!isOpen) {
        close();
      }
    },
    sync() {
      syncInput();
      if (isOpen) {
        render();
      }
    },
    close,
  };
}

function buildCalendarDays(monthDate) {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startOffset = (start.getDay() + 6) % 7;
  const days = [];

  for (let index = 0; index < startOffset; index += 1) {
    days.push({ inMonth: false });
  }

  for (let day = 1; day <= end.getDate(); day += 1) {
    const date = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
    days.push({
      inMonth: true,
      date,
      iso: formatIsoDate(date),
    });
  }

  while (days.length % 7 !== 0) {
    days.push({ inMonth: false });
  }

  return days;
}

function shiftMonth(monthKey, delta) {
  const date = parseMonthKey(monthKey);
  date.setMonth(date.getMonth() + delta);
  return formatMonthKey(date);
}

function parseMonthKey(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function formatMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatIsoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
