"""Entry point for Majplay local ranking system."""

import sys
from PyQt5 import QtWidgets
import qdarktheme

from ranking_manager import RankingManager
from ui_components import MainWindow

SONGS = [
    "Ποσειδών (Poseidon)",
    "Blue Zenith",
    "L9",
    "Brain Power",
    "Garakuta Doll Play",
    "YURUSHITE",
    "Sparkle Dance",
    "System Split",
]


def main():
    app = QtWidgets.QApplication(sys.argv)
    qdarktheme.setup_theme()
    manager = RankingManager()
    window = MainWindow(manager, SONGS)
    window.show()
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
