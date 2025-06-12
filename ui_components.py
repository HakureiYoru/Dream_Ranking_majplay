from PyQt5 import QtWidgets, QtCore, QtGui

class InputWidget(QtWidgets.QWidget):
    """Widget containing score input controls."""

    submit_clicked = QtCore.pyqtSignal(str, float, str, str)
    clear_clicked = QtCore.pyqtSignal()
    export_clicked = QtCore.pyqtSignal()
    delete_clicked = QtCore.pyqtSignal()

    def __init__(self, songs: list, parent=None):
        super().__init__(parent)
        self.songs = songs
        self._setup_ui()

    def _setup_ui(self):
        layout = QtWidgets.QVBoxLayout(self)
        form = QtWidgets.QFormLayout()
        self.player_edit = QtWidgets.QLineEdit()
        self.score_spin = QtWidgets.QDoubleSpinBox()
        self.score_spin.setRange(0.0, 101.0)
        self.score_spin.setDecimals(2)
        self.score_spin.setSingleStep(0.01)
        self.song_combo = QtWidgets.QComboBox()
        self.song_combo.addItems(self.songs)
        self.diff_combo = QtWidgets.QComboBox()
        self.diff_combo.addItems(["Basic", "Advanced", "Expert", "Master", "Re:MASTER"])

        form.addRow("玩家 ID:", self.player_edit)
        form.addRow("分数:", self.score_spin)
        form.addRow("曲目:", self.song_combo)
        form.addRow("难度:", self.diff_combo)

        self.submit_btn = QtWidgets.QPushButton("提交")
        self.clear_btn = QtWidgets.QPushButton("清空记录")
        self.delete_btn = QtWidgets.QPushButton("删除选择")
        self.export_btn = QtWidgets.QPushButton("导出 CSV")

        btn_layout = QtWidgets.QHBoxLayout()
        btn_layout.addWidget(self.submit_btn)
        btn_layout.addWidget(self.clear_btn)
        btn_layout.addWidget(self.delete_btn)
        btn_layout.addWidget(self.export_btn)

        layout.addLayout(form)
        layout.addLayout(btn_layout)
        layout.addStretch()

        self.submit_btn.clicked.connect(self._emit_submit)
        self.clear_btn.clicked.connect(self.clear_clicked)
        self.delete_btn.clicked.connect(self.delete_clicked)
        self.export_btn.clicked.connect(self.export_clicked)

    def _emit_submit(self):
        player = self.player_edit.text().strip()
        score = self.score_spin.value()
        song = self.song_combo.currentText()
        diff = self.diff_combo.currentText()
        if player:
            self.submit_clicked.emit(player, score, song, diff)
            self.player_edit.clear()
            self.score_spin.setValue(0.0)
        
class RankingTable(QtWidgets.QTableWidget):
    """Table widget for displaying rankings."""

    headers = ["排名", "玩家ID", "分数", "曲目", "难度", "时间"]

    def __init__(self, parent=None):
        super().__init__(0, len(self.headers), parent)
        self.setHorizontalHeaderLabels(self.headers)
        header = self.horizontalHeader()
        header.setSectionResizeMode(QtWidgets.QHeaderView.Stretch)
        self.setAlternatingRowColors(True)
        self.verticalHeader().setVisible(False)
        font = self.font()
        font.setBold(True)
        header.setFont(font)
        self.setEditTriggers(QtWidgets.QAbstractItemView.NoEditTriggers)
        self.setSelectionBehavior(QtWidgets.QAbstractItemView.SelectRows)
        self.setSelectionMode(QtWidgets.QAbstractItemView.SingleSelection)

    def update_records(self, records):
        self.setRowCount(len(records))
        for row, rec in enumerate(records):
            values = [
                str(row + 1),
                rec.player_id,
                f"{rec.score:.2f}",
                rec.song,
                rec.difficulty,
                rec.time,
            ]
            for col, val in enumerate(values):
                item = QtWidgets.QTableWidgetItem(val)
                item.setTextAlignment(QtCore.Qt.AlignCenter)
                self.setItem(row, col, item)
            

class MainWindow(QtWidgets.QMainWindow):
    """Main application window."""

    def __init__(self, ranking_manager, songs, parent=None):
        super().__init__(parent)
        self.ranking_manager = ranking_manager
        self.songs = songs
        self.setWindowTitle("Majplay 线下活动本地打榜系统")
        self.resize(900, 500)
        self._setup_ui()
        self.refresh_table()

    def _setup_ui(self):
        central = QtWidgets.QWidget()
        self.setCentralWidget(central)
        main_layout = QtWidgets.QHBoxLayout(central)

        self.input_widget = InputWidget(self.songs)
        self.table_widget = RankingTable()

        main_layout.addWidget(self.input_widget, 1)
        main_layout.addWidget(self.table_widget, 2)

        self.input_widget.submit_clicked.connect(self.add_record)
        self.input_widget.clear_clicked.connect(self.clear_records)
        self.input_widget.export_clicked.connect(self.export_csv)
        self.input_widget.delete_clicked.connect(self.delete_selected_record)

        self.apply_styles()

    def apply_styles(self):
        self.setStyleSheet(
            """
            QWidget {
                font-family: 'Microsoft YaHei';
                font-size: 12px;
            }
            QPushButton {
                background-color: #5DADE2;
                border-radius: 5px;
                padding: 6px 12px;
                color: white;
            }
            QPushButton:hover {
                background-color: #3498DB;
            }
            QHeaderView::section {
                background-color: #5DADE2;
                color: white;
                padding: 4px;
                border: 1px solid #A9CCE3;
            }
            QTableWidget {
                gridline-color: #D5DBDB;
                background-color: #FBFCFC;
                alternate-background-color: #EBF5FB;
                selection-background-color: #AED6F1;
            }
            """
        )

    def add_record(self, player, score, song, diff):
        self.ranking_manager.add_record(player, score, song, diff)
        self.refresh_table()
        QtWidgets.QMessageBox.information(self, "提示", "🎉 成绩已成功录入！")

    def refresh_table(self):
        self.ranking_manager.sort_records()
        self.table_widget.update_records(self.ranking_manager.get_records())

    def clear_records(self):
        reply = QtWidgets.QMessageBox.question(
            self,
            "确认",
            "确定要清空所有记录吗？",
            QtWidgets.QMessageBox.Yes | QtWidgets.QMessageBox.No,
        )
        if reply == QtWidgets.QMessageBox.Yes:
            self.ranking_manager.clear_records()
            self.refresh_table()

    def export_csv(self):
        path, _ = QtWidgets.QFileDialog.getSaveFileName(
            self, "导出 CSV", "scores.csv", "CSV Files (*.csv)"
        )
        if path:
            self.ranking_manager.export_csv(path)

    def delete_selected_record(self):
        indexes = self.table_widget.selectionModel().selectedRows()
        if not indexes:
            QtWidgets.QMessageBox.information(self, "提示", "请先选择要删除的记录")
            return
        reply = QtWidgets.QMessageBox.question(
            self,
            "确认",
            "确定要删除所选记录吗？",
            QtWidgets.QMessageBox.Yes | QtWidgets.QMessageBox.No,
        )
        if reply == QtWidgets.QMessageBox.Yes:
            for index in sorted(indexes, key=lambda x: x.row(), reverse=True):
                self.ranking_manager.delete_record(index.row())
            self.refresh_table()
