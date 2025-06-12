from PyQt5 import QtWidgets, QtCore, QtGui
from datetime import datetime, timedelta

class SegmentProgressBar(QtWidgets.QWidget):
    """Progress bar showing practice and challenge segments."""

    def __init__(self, practice_ratio: float = 0.75, parent=None):
        super().__init__(parent)
        self.practice_ratio = practice_ratio
        self.progress = 0.0
        self.phase = "practice"
        self.warning = False
        self.setMinimumHeight(26)

    def set_state(self, progress: float, phase: str, warning: bool) -> None:
        self.progress = max(0.0, min(progress, 1.0))
        self.phase = phase
        self.warning = warning
        self.update()

    def paintEvent(self, event):
        painter = QtGui.QPainter(self)
        painter.setRenderHint(QtGui.QPainter.Antialiasing)
        rect = self.rect().adjusted(2, 2, -2, -2)
        radius = rect.height() / 2

        practice_width = rect.width() * self.practice_ratio
        practice_rect = QtCore.QRectF(rect.left(), rect.top(), practice_width, rect.height())
        challenge_rect = QtCore.QRectF(
            practice_rect.right(), rect.top(), rect.width() - practice_rect.width(), rect.height()
        )

        painter.setPen(QtCore.Qt.NoPen)
        painter.setBrush(QtGui.QColor("#bdc3c7"))
        painter.drawRoundedRect(practice_rect, radius, radius)
        painter.setBrush(QtGui.QColor("#d5d8dc"))
        painter.drawRoundedRect(challenge_rect, radius, radius)

        progress_width = rect.width() * self.progress
        progress_rect = QtCore.QRectF(rect.left(), rect.top(), progress_width, rect.height())
        if self.phase == "challenge":
            color = QtGui.QColor("#3498db")
        else:
            color = QtGui.QColor("#95a5a6" if not self.warning else "#f1c40f")
        painter.setBrush(color)
        painter.drawRoundedRect(progress_rect, radius, radius)

        painter.setPen(QtGui.QPen(QtGui.QColor("#aaaaaa")))
        painter.drawLine(practice_rect.right(), rect.top(), practice_rect.right(), rect.bottom())

        painter.setPen(QtGui.QColor("#2c3e50"))
        font = painter.font()
        font.setBold(True)
        painter.setFont(font)
        painter.drawText(practice_rect, QtCore.Qt.AlignCenter, "自由练习时间")
        painter.drawText(challenge_rect, QtCore.Qt.AlignCenter, "打榜时间")


class TimeProgressWidget(QtWidgets.QWidget):
    """Widget displaying current ranking challenge progress."""

    def __init__(self, parent=None, cycle_hours: int = 2, practice_minutes: int = 90):
        super().__init__(parent)
        self.cycle_hours = cycle_hours
        self.practice_minutes = practice_minutes
        self.practice_ratio = practice_minutes / (cycle_hours * 60)

        self._setup_ui()
        self.timer = QtCore.QTimer(self)
        self.timer.timeout.connect(self.update_state)
        self.timer.start(10000)
        self.update_state()

    def _setup_ui(self):
        layout = QtWidgets.QVBoxLayout(self)
        self.progress_bar = SegmentProgressBar(self.practice_ratio)
        self.info_label = QtWidgets.QLabel()
        self.info_label.setAlignment(QtCore.Qt.AlignCenter)
        self.countdown_label = QtWidgets.QLabel()
        self.countdown_label.setAlignment(QtCore.Qt.AlignCenter)

        info_font = QtGui.QFont("Microsoft YaHei", 10, QtGui.QFont.Bold)
        self.info_label.setFont(info_font)
        cd_font = QtGui.QFont("Microsoft YaHei", 9)
        self.countdown_label.setFont(cd_font)

        layout.addWidget(self.progress_bar)
        layout.addWidget(self.info_label)
        layout.addWidget(self.countdown_label)

    def get_current_cycle_range(self):
        now = datetime.now()
        start_hour = (now.hour // self.cycle_hours) * self.cycle_hours
        start = now.replace(hour=start_hour, minute=0, second=0, microsecond=0)
        if start > now:
            start -= timedelta(hours=self.cycle_hours)
        end = start + timedelta(hours=self.cycle_hours)
        return start, end

    def get_current_phase(self):
        now = datetime.now()
        start, _ = self.get_current_cycle_range()
        challenge_start = start + timedelta(minutes=self.practice_minutes)
        if now >= challenge_start:
            return "challenge", False
        return "practice", (challenge_start - now) <= timedelta(minutes=5)

    def get_time_remaining(self):
        now = datetime.now()
        start, end = self.get_current_cycle_range()
        challenge_start = start + timedelta(minutes=self.practice_minutes)
        if now < challenge_start:
            return challenge_start - now
        return end - now

    def update_state(self) -> None:
        start, end = self.get_current_cycle_range()
        total_seconds = (end - start).total_seconds()
        elapsed = (datetime.now() - start).total_seconds()
        progress = elapsed / total_seconds
        phase, warning = self.get_current_phase()

        self.progress_bar.set_state(progress, phase, warning)

        remaining = self.get_time_remaining()
        m, s = divmod(int(remaining.total_seconds()), 60)
        h, m = divmod(m, 60)
        if phase == "practice":
            text = "自由练习时间"
            if warning:
                text = "⚠️ 打榜即将开始"
            self.info_label.setText(text)
            self.countdown_label.setText(f"距离本轮打榜开始还有 {m:02d}:{s:02d}")
        else:
            self.info_label.setText("🎯 正在打榜中！快来挑战排行榜！")
            self.countdown_label.setText(f"本轮打榜剩余时间：{m:02d}:{s:02d}")
