/*
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at http://mozilla.org/MPL/2.0/.
 */

//! A library to efficiently simulate Conway's Game of Life using the HashLife algorithm.

#[macro_use]
extern crate failure;
#[macro_use]
extern crate nom;

mod life;
pub mod node;
pub mod parse;

pub use crate::life::Life;
use crate::{node::Quadrant, parse::rle::RleError};

/// An error that can occur.
#[derive(Debug, Fail)]
pub enum Error {
    /// An IO error.
    #[fail(display = "IO error: {}", io)]
    Io { io: std::io::Error },
    #[fail(display = "RLE pattern error: {}", rle)]
    /// An RLE error.
    Rle { rle: RleError },
}

/// A cell in a Life grid.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Cell {
    /// An alive cell.
    Alive,
    /// A dead cell.
    Dead,
}

impl Cell {
    /// Creates a new `Cell`.
    pub fn new(alive: bool) -> Self {
        if alive {
            Cell::Alive
        } else {
            Cell::Dead
        }
    }

    /// Returns true for `Cell::Alive` and false for `Cell::Dead`.
    pub fn is_alive(self) -> bool {
        match self {
            Cell::Alive => true,
            Cell::Dead => false,
        }
    }
}

/// The position of a cell in a Life grid.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Position {
    /// The x coordinate.
    pub x: i64,
    /// The y coordinate.
    pub y: i64,
}

impl Position {
    /// Creates a new position with the given coordinates.
    pub fn new(x: i64, y: i64) -> Self {
        Self { x, y }
    }

    /// Offsets the position by the given amounts in the x and y directions.
    pub fn offset(&self, x_offset: i64, y_offset: i64) -> Self {
        Self {
            x: self.x + x_offset,
            y: self.y + y_offset,
        }
    }

    /// Returns which quadrant of a node the position is in.
    pub fn quadrant(&self) -> Quadrant {
        match (self.x < 0, self.y < 0) {
            (true, true) => Quadrant::Northwest,
            (false, true) => Quadrant::Northeast,
            (true, false) => Quadrant::Southwest,
            (false, false) => Quadrant::Southeast,
        }
    }
}

/// A rectangular region of a Life grid.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct BoundingBox {
    upper_left: Position,
    lower_right: Position,
}

impl BoundingBox {
    /// Creates a new bounding box with the given upper-left corner position and lower-right corner
    /// position.
    pub fn new(upper_left: Position, lower_right: Position) -> Self {
        assert!(upper_left.x <= lower_right.x);
        assert!(upper_left.y <= lower_right.y);
        Self {
            upper_left,
            lower_right,
        }
    }

    /// Returns the upper left corner position of the bounding box.
    pub fn upper_left(&self) -> Position {
        self.upper_left
    }

    /// Returns the lower right corner position of the bounding box.
    pub fn lower_right(&self) -> Position {
        self.lower_right
    }

    /// Combines two bounding boxes, returning a bounding box that surrounds both boxes.
    pub fn combine(&self, other: BoundingBox) -> Self {
        let min_x = Ord::min(self.upper_left.x, other.upper_left.x);
        let min_y = Ord::min(self.upper_left.y, other.upper_left.y);
        let max_x = Ord::max(self.lower_right.x, other.lower_right.x);
        let max_y = Ord::max(self.lower_right.y, other.lower_right.y);

        Self::new(Position::new(min_x, min_y), Position::new(max_x, max_y))
    }

    /// Intersects two bounding boxes, returning a bounding box that both boxes contain.
    pub fn intersect(&self, other: BoundingBox) -> Option<Self> {
        let min_x = Ord::max(self.upper_left.x, other.upper_left.x);
        let min_y = Ord::max(self.upper_left.y, other.upper_left.y);
        let max_x = Ord::min(self.lower_right.x, other.lower_right.x);
        let max_y = Ord::min(self.lower_right.y, other.lower_right.y);

        if min_x > max_x || min_y > max_y {
            None
        } else {
            Some(Self::new(
                Position::new(min_x, min_y),
                Position::new(max_x, max_y),
            ))
        }
    }

    /// Offsets the bounding box by the given amounts in the x and y directions.
    pub fn offset(&self, x_offset: i64, y_offset: i64) -> Self {
        Self::new(
            self.upper_left.offset(x_offset, y_offset),
            self.lower_right.offset(x_offset, y_offset),
        )
    }

    /// Pads the outside of the bounding box by the given amount.
    pub fn pad(&self, amount: i64) -> Self {
        assert!(amount >= 0);
        Self {
            upper_left: self.upper_left.offset(-amount, -amount),
            lower_right: self.lower_right.offset(amount, amount),
        }
    }
}
