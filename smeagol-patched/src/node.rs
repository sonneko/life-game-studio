/*
 * This Source Code Form is subject to the terms of the Mozilla Public License,
 * v. 2.0. If a copy of the MPL was not distributed with this file, You can
 * obtain one at http://mozilla.org/MPL/2.0/.
 */

//! Inner workings of `smeagol`.
mod impls;
mod store;

pub use self::store::{NodeTemplate, Store};
use std::hash::{Hash, Hasher};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash)]
pub struct u16x16(pub [u16; 16]);

impl u16x16 {
    pub fn new(
        l0: u16, l1: u16, l2: u16, l3: u16, l4: u16, l5: u16, l6: u16, l7: u16,
        l8: u16, l9: u16, l10: u16, l11: u16, l12: u16, l13: u16, l14: u16, l15: u16,
    ) -> Self {
        u16x16([l0, l1, l2, l3, l4, l5, l6, l7, l8, l9, l10, l11, l12, l13, l14, l15])
    }

    pub fn splat(v: u16) -> Self {
        u16x16([v; 16])
    }

    pub fn extract(self, idx: usize) -> u16 {
        self.0[idx]
    }

    pub fn replace(mut self, idx: usize, val: u16) -> Self {
        self.0[idx] = val;
        self
    }

    pub fn count_ones(self) -> u16x16 {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = self.0[i].count_ones() as u16; }
        u16x16(res)
    }

    pub fn wrapping_sum(self) -> u16 {
        self.0.iter().fold(0, |acc, &x| acc.wrapping_add(x))
    }
}

impl std::ops::BitAnd for u16x16 {
    type Output = Self;
    fn bitand(self, rhs: Self) -> Self {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = self.0[i] & rhs.0[i]; }
        u16x16(res)
    }
}

impl std::ops::BitOr for u16x16 {
    type Output = Self;
    fn bitor(self, rhs: Self) -> Self {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = self.0[i] | rhs.0[i]; }
        u16x16(res)
    }
}

impl std::ops::BitXor for u16x16 {
    type Output = Self;
    fn bitxor(self, rhs: Self) -> Self {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = self.0[i] ^ rhs.0[i]; }
        u16x16(res)
    }
}

impl std::ops::BitXorAssign for u16x16 {
    fn bitxor_assign(&mut self, rhs: Self) {
        for i in 0..16 { self.0[i] ^= rhs.0[i]; }
    }
}

impl std::ops::Not for u16x16 {
    type Output = Self;
    fn not(self) -> Self {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = !self.0[i]; }
        u16x16(res)
    }
}

impl std::ops::Shl<u32> for u16x16 {
    type Output = Self;
    fn shl(self, rhs: u32) -> Self {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = self.0[i] << rhs; }
        u16x16(res)
    }
}

impl std::ops::Shr<u32> for u16x16 {
    type Output = Self;
    fn shr(self, rhs: u32) -> Self {
        let mut res = [0u16; 16];
        for i in 0..16 { res[i] = self.0[i] >> rhs; }
        u16x16(res)
    }
}

#[macro_export]
macro_rules! shuffle_u16x16 {
    ($board:expr, [$($idx:expr),*]) => {
        $crate::node::u16x16([$(($board).0[$idx]),*])
    };
}

pub const LEVEL_4_UPPER_HALF_MASK: u16x16 = u16x16([
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
]);

pub const LEVEL_4_LOWER_HALF_MASK: u16x16 = u16x16([
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
    0b1111_1111_1111_1111,
]);

pub const LEVEL_4_NW_MASK: u16x16 = u16x16([
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
]);

pub const LEVEL_4_NE_MASK: u16x16 = u16x16([
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
]);

pub const LEVEL_4_SW_MASK: u16x16 = u16x16([
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
    0b1111_1111_0000_0000,
]);

pub const LEVEL_4_SE_MASK: u16x16 = u16x16([
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_0000_0000,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
    0b0000_0000_1111_1111,
]);

pub fn center(nw_grid: u16x16, ne_grid: u16x16, sw_grid: u16x16, se_grid: u16x16) -> u16x16 {
    let nw_grid = nw_grid << 8;
    let sw_grid = sw_grid << 8;
    let left: u16x16 = u16x16([
        nw_grid.0[8], nw_grid.0[9], nw_grid.0[10], nw_grid.0[11], nw_grid.0[12], nw_grid.0[13], nw_grid.0[14], nw_grid.0[15],
        sw_grid.0[0], sw_grid.0[1], sw_grid.0[2], sw_grid.0[3], sw_grid.0[4], sw_grid.0[5], sw_grid.0[6], sw_grid.0[7],
    ]);

    let ne_grid = ne_grid >> 8;
    let se_grid = se_grid >> 8;
    let right: u16x16 = u16x16([
        ne_grid.0[8], ne_grid.0[9], ne_grid.0[10], ne_grid.0[11], ne_grid.0[12], ne_grid.0[13], ne_grid.0[14], ne_grid.0[15],
        se_grid.0[0], se_grid.0[1], se_grid.0[2], se_grid.0[3], se_grid.0[4], se_grid.0[5], se_grid.0[6], se_grid.0[7],
    ]);

    left | right
}

/// An index in a store.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Index(pub u32);

/// The level of a node.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct Level(pub u8);

/// The four quadrants of a node.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub enum Quadrant {
    /// The northwest quadrant.
    Northwest,
    /// The northeast quadrant.
    Northeast,
    /// The southwest quadrant.
    Southwest,
    /// The southeast quadrant.
    Southeast,
}

/// An identifier referring to a node in a store.
#[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd)]
pub struct NodeId {
    /// The index of the node in the store.
    pub index: Index,
}

/// An immutable quadtree representation of a Life grid.
#[derive(Clone, Copy, Debug)]
pub enum Node {
    /// A leaf (16 by 16) node.
    Leaf {
        /// The grid itself.
        ///
        /// 1 represents an alive cell, 0 represents a dead cell.
        grid: u16x16,
    },
    /// A non-leaf node.
    Interior {
        /// The northwest child.
        nw: NodeId,
        /// The northeast child.
        ne: NodeId,
        /// The southwest child.
        sw: NodeId,
        /// The southeast child.
        se: NodeId,
        /// The level of the node.
        level: Level,
        /// The number of alive cells in the node.
        population: u128,
    },
}

impl PartialEq for Node {
    fn eq(&self, other: &Node) -> bool {
        match (self, other) {
            (Node::Leaf { grid }, Node::Leaf { grid: other_grid }) => grid == other_grid,
            (
                Node::Interior { nw, ne, sw, se, .. },
                Node::Interior {
                    nw: other_nw,
                    ne: other_ne,
                    sw: other_sw,
                    se: other_se,
                    ..
                },
            ) => nw == other_nw && ne == other_ne && sw == other_sw && se == other_se,
            _ => false,
        }
    }
}

impl Eq for Node {}

impl Hash for Node {
    fn hash<H>(&self, state: &mut H)
    where
        H: Hasher,
    {
        match self {
            Node::Leaf { grid } => grid.hash(state),
            Node::Interior { nw, ne, sw, se, .. } => {
                nw.hash(state);
                ne.hash(state);
                sw.hash(state);
                se.hash(state);
            }
        }
    }
}

/// Internal methods.
impl Node {
    /// Returns the inner grid of a leaf node.
    ///
    /// # Panics
    ///
    /// Panics if the node is not a leaf.
    pub fn unwrap_leaf(&self) -> u16x16 {
        match *self {
            Node::Leaf { grid } => grid,
            Node::Interior { .. } => panic!(),
        }
    }
}
